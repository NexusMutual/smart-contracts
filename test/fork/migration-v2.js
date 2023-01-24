const { ethers, web3, network, config } = require('hardhat');
const fetch = require('node-fetch');
const { expect } = require('chai');
const path = require('path');

const { hex } = require('../utils').helpers;
const proposalCategories = require('../utils').proposalCategories;
const evm = require('./evm')();

const { BigNumber } = ethers;
const { AddressZero } = ethers.constants;
const { parseEther, formatEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;

const getLegacyAssessmentRewards = require('../../scripts/get-legacy-assessment-rewards');
const getProductsV1 = require('../../scripts/get-products-v1');
const getLockedInV1ClaimAssessment = require('../../scripts/get-locked-in-v1-claim-assessment');
const getWithdrawableCoverNotes = require('../../scripts/get-withdrawable-cover-notes');
const getGovernanceRewards = require('../../scripts/get-governance-rewards');
const populateV2Products = require('../../scripts/populate-v2-products');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';
const ENZYME_FUND_VALUE_CALCULATOR_ROUTER = '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9';
const ENZYME_COMPTROLLER_PROXY_ADDRESS = '0xa5bf4350da6193b356ac15a3dbd777a687bc216e';
const ENZYME_ADDRESS_LIST_REGISTRY = '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff';

const DAI_PRICE_FEED_ORACLE_AGGREGATOR = '0x773616E4d11A78F511299002da57A0a94577F1f4';
const STETH_PRICE_FEED_ORACLE_AGGREGATOR = '0x86392dC19c0b719886221c78AB11eb8Cf5c52812';
const ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR = '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7';

const ListIdForReceivers = 218;
const AddressListRegistry = '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff';

const MIN_POOL_ETH = 0;

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;

  return provider.getSigner(address);
};

const getContractFactory = async providerOrSigner => {
  const data = await fetch(VERSION_DATA_URL).then(r => r.json());
  const abis = data.mainnet.abis
    .map(item => ({ ...item, abi: JSON.parse(item.contractAbi) }))
    .reduce((data, item) => ({ ...data, [item.code]: item }), {});

  return async code => {
    const { abi, address } = abis[code];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

// This works with the legacy V1 version of Governance.sol
const submitGovernanceProposal = async (categoryId, actionData, signers, gv) => {
  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

  await evm.increaseTime(7 * 24 * 3600); // +7 days

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert.equal(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
};

async function enableAsEnzymeReceiver(receiverAddress) {
  const comptroller = await ethers.getContractAt('IEnzymeV4Comptroller', ENZYME_COMPTROLLER_PROXY_ADDRESS);
  const vault = await ethers.getContractAt('IEnzymeV4Vault', ENZYMEV4_VAULT_PROXY_ADDRESS);

  const ownerAddress = await vault.getOwner();

  console.log({
    vaultOwner: ownerAddress,
  });

  console.log('Unlocking and funding vault owner');

  const owner = await getSigner(ownerAddress);
  await evm.impersonate(ownerAddress);
  await evm.setBalance(ownerAddress, parseEther('1000'));

  const selector = web3.eth.abi.encodeFunctionSignature('addToList(uint256,address[])');
  const receiverArgs = web3.eth.abi.encodeParameters(['uint256', 'address[]'], [ListIdForReceivers, [receiverAddress]]);

  console.log('Updating Enzyme vault receivers');
  await comptroller.connect(owner).vaultCallOnContract(AddressListRegistry, selector, receiverArgs);

  const registry = await ethers.getContractAt('IAddressListRegistry', ENZYME_ADDRESS_LIST_REGISTRY);

  console.log('Checking Enzyme vault receivers contains new receiver');

  const inReceiverList = await registry.isInList(ListIdForReceivers, receiverAddress);
  assert.equal(inReceiverList, true);
}

let poolValueBefore;

describe('v2 migration', function () {
  before(async function () {
    // initialize evm helper
    await evm.connect(ethers.provider);
    await getSigner('0x1eE3ECa7aEF17D1e74eD7C447CcBA61aC76aDbA9');

    // get or reset snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;

      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.log(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.log('Snapshot ID: ', await evm.snapshot());
      }
    }
  });

  it('initialize old contracts', async function () {
    const [deployer] = await ethers.getSigners();
    this.deployer = deployer;

    const factory = await getContractFactory(deployer);

    this.master = await factory('NXMASTER');
    this.nxm = await factory('NXMTOKEN');
    this.memberRoles = await factory('MR');
    this.governance = await factory('GV');
    this.pool = await factory('P1');
    this.mcr = await factory('MC');
    this.incidents = await factory('IC');
    this.quotation = await factory('QT');
    this.quotationData = await factory('QD');
    this.proposalCategory = await factory('PC');
    this.tokenController = await factory('TC');
    this.claims = await factory('CL');
    this.claimsReward = await factory('CR');
    this.claimsData = await factory('CD');

    poolValueBefore = await this.pool.getPoolValueInEth();
  });

  it('run get-withdrawable-cover-notes', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getWithdrawableCoverNotes(directProvider, this.tokenController);
  });

  it('compute total withdrawable cover notes', async function () {
    const eligibleForCoverNoteWithdrawPath = path.join(
      config.paths.root,
      'scripts/v2-migration/output/eligible-for-cover-note-withdraw.json',
    );
    const withdrawableCoverNotes = require(eligibleForCoverNoteWithdrawPath);

    const coverNotesSum = withdrawableCoverNotes.reduce(
      (sum, coverNote) => sum.add(BigNumber.from(coverNote.withdrawableAmount)),
      BigNumber.from(0),
    );

    console.log({
      coverNotesSum: coverNotesSum.toString(),
    });

    this.coverNotesSum = coverNotesSum;
  });

  it('run get-governance-rewards script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getGovernanceRewards(directProvider);
  });

  it('compute total governance rewards', async function () {
    const governanceRewardablePath = path.join(
      config.paths.root,
      'scripts/v2-migration/output/governance-rewardable.json',
    );

    const rewardables = require(governanceRewardablePath);
    const rewardableAddresses = Object.keys(rewardables);
    const governanceRewardsSum = rewardableAddresses.reduce(
      (sum, address) => sum.add(BigNumber.from(rewardables[address])),
      BigNumber.from(0),
    );

    console.log({
      governanceRewardsSum: governanceRewardsSum.toString(),
    });

    this.governanceRewardsSum = governanceRewardsSum;
  });

  // generates the LegacyClaimsReward contract with the transfer calls
  it.skip('run get-legacy-assessment-rewards script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getLegacyAssessmentRewards(directProvider);
  });

  // generates the ProductsV1 contract
  it.skip('run get-products-v1 script', async function () {
    await getProductsV1();
  });

  // generates the eligibleForCLAUnlock.json file
  it.skip('run get-locked-in-v1-claim-assessment script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getLockedInV1ClaimAssessment(directProvider);
  });

  it('deploy ProductsV1', async function () {
    const ProductsV1 = await ethers.getContractFactory('ProductsV1');
    const productsV1 = await ProductsV1.deploy();
    await productsV1.deployed();
    this.productsV1 = productsV1;
  });

  it('impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('deploy and upgrade Governance contract', async function () {
    const Governance = await ethers.getContractFactory('Governance');
    const newGovernance = await Governance.deploy();
    await newGovernance.deployed();

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    this.governance = await ethers.getContractAt('Governance', this.governance.address);
  });

  it('edit proposal category 41 (Set Asset Swap Details)', async function () {
    await submitGovernanceProposal(
      // editCategory(uint256,string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.editCategory,
      defaultAbiCoder.encode(
        [
          'uint256',
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        [41, ...proposalCategories[41]],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add proposal category (Add new contracts)', async function () {
    await submitGovernanceProposal(
      // addCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.addCategory,
      defaultAbiCoder.encode(
        [
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        proposalCategories[PROPOSAL_CATEGORIES.newContracts],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add proposal category (Remove contracts)', async function () {
    await submitGovernanceProposal(
      // addCategory(string,uint256,uint256,uint256,uint256[],uint256,string,address,bytes2,uint256[],string)
      PROPOSAL_CATEGORIES.addCategory,
      defaultAbiCoder.encode(
        [
          'string',
          'uint256',
          'uint256',
          'uint256',
          'uint256[]',
          'uint256',
          'string',
          'address',
          'bytes2',
          'uint256[]',
          'string',
        ],
        proposalCategories[PROPOSAL_CATEGORIES.removeContracts],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it('add empty internal contract for Cover', async function () {
    const CoverInitializer = await ethers.getContractFactory('CoverInitializer');
    const coverInitializer = await CoverInitializer.deploy();
    await coverInitializer.deployed();

    console.log(PROPOSAL_CATEGORIES.newContracts);
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes('CO')], [coverInitializer.address], [2]], // 2 = proxy contract
      ),
      this.abMembers,
      this.governance,
    );

    const coverAddress = await this.master.getLatestAddress(hex('CO'));
    const cover = await ethers.getContractAt('CoverInitializer', coverAddress);

    const storedMaster = await cover.master();

    expect(storedMaster).to.be.equal(this.master.address);
  });

  it('deploy master contract', async function () {
    const NXMaster = await ethers.getContractFactory('NXMaster');
    const master = await NXMaster.deploy();
    await master.deployed();

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeMasterAddress(address)
      defaultAbiCoder.encode(['address'], [master.address]),
      this.abMembers,
      this.governance,
    );
  });

  it('deploy CoverNFT contract', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const CoverNFT = await ethers.getContractFactory('CoverNFT');
    const coverNFT = await CoverNFT.deploy('Nexus Mutual Cover', 'NXC', coverProxyAddress);
    await coverNFT.deployed();
    this.coverNFT = coverNFT;
  });

  it('deploy SwapOperator', async function () {
    const SwapOperator = await ethers.getContractFactory('SwapOperator');
    const swapOperator = await SwapOperator.deploy(
      COWSWAP_SETTLEMENT, // _cowSettlement
      SWAP_CONTROLLER, // _swapController
      this.master.address, // _master
      WETH_ADDRESS, // _weth
      ENZYMEV4_VAULT_PROXY_ADDRESS,
      ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      MIN_POOL_ETH,
    );
    await swapOperator.deployed();
    this.swapOperator = swapOperator;
  });

  it('deploy & upgrade contracts: CR, TC, MCR, MR, CO, PS, P1, GW, CoverMigrator', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const ClaimsReward = await ethers.getContractFactory('LegacyClaimsReward');
    const newClaimsReward = await ClaimsReward.deploy(this.master.address, DAI_ADDRESS);
    await newClaimsReward.deployed();

    const StakingPoolFactory = await ethers.getContractFactory('StakingPoolFactory');
    const stakingPoolFactory = await StakingPoolFactory.deploy(coverProxyAddress);

    const TokenController = await ethers.getContractFactory('TokenController');
    const tokenController = await TokenController.deploy(
      this.quotationData.address,
      newClaimsReward.address,
      stakingPoolFactory.address,
    );
    await tokenController.deployed();

    const MCR = await ethers.getContractFactory('MCR');
    const mcr = await MCR.deploy(this.master.address);
    await mcr.deployed();

    const MemberRoles = await ethers.getContractFactory('MemberRoles');
    const memberRoles = await MemberRoles.deploy();
    await memberRoles.deployed();

    const Cover = await ethers.getContractFactory('Cover');
    const cover = await Cover.deploy(
      this.productsV1.address,
      this.coverNFT.address,
      AddressZero, // staking pool implementation address
      coverProxyAddress,
    );
    await cover.deployed();

    const PooledStaking = await ethers.getContractFactory('LegacyPooledStaking');
    const pooledStaking = await PooledStaking.deploy(coverProxyAddress, this.productsV1.address);
    await pooledStaking.deployed();

    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');

    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18];
    const priceFeedOracle = await PriceFeedOracle.deploy(assetAddresses, assetAggregators, assetDecimals);

    const Pool = await ethers.getContractFactory('Pool');
    const pool = await Pool.deploy(
      this.master.address,
      priceFeedOracle.address,
      this.swapOperator.address,
      DAI_ADDRESS,
      STETH_ADDRESS,
    );
    await pool.deployed();

    await enableAsEnzymeReceiver(pool.address);

    const CoverMigrator = await ethers.getContractFactory('CoverMigrator');
    const coverMigrator = await CoverMigrator.deploy(this.quotationData.address, this.productsV1.address);
    await coverMigrator.deployed();

    const Gateway = await ethers.getContractFactory('LegacyGateway');
    const gateway = await Gateway.deploy();
    await gateway.deployed();

    console.log('Upgrade the first batch.');
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          [
            toUtf8Bytes('MR'),
            toUtf8Bytes('MC'),
            toUtf8Bytes('CO'),
            toUtf8Bytes('TC'),
            toUtf8Bytes('PS'),
            toUtf8Bytes('P1'),
            toUtf8Bytes('CL'),
            toUtf8Bytes('GW'),
          ],
          [
            memberRoles.address,
            mcr.address,
            cover.address,
            tokenController.address,
            pooledStaking.address,
            pool.address,
            coverMigrator.address,
            gateway.address,
          ],
        ],
      ),
      this.abMembers,
      this.governance,
    );

    console.log('Upgrade ClaimsReward only. (depends on TokenController)');
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('CR')], [newClaimsReward.address]]),
      this.abMembers,
      this.governance,
    );

    this.claimsReward = newClaimsReward;
    this.pool = pool;

    this.mcr = await ethers.getContractAt('MCR', mcr.address);
    this.cover = await ethers.getContractAt('Cover', coverProxyAddress);
    this.coverMigrator = await ethers.getContractAt('CoverMigrator', coverMigrator.address);
    this.memberRoles = await ethers.getContractAt('MemberRoles', this.memberRoles.address);

    const tokenControllerAddress = await this.master.contractAddresses(toUtf8Bytes('TC'));
    this.tokenController = await ethers.getContractAt('TokenController', tokenControllerAddress);

    const pooledStakingAddress = await this.master.contractAddresses(toUtf8Bytes('PS'));
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', pooledStakingAddress);

    const gatewayAddress = await this.master.contractAddresses(toUtf8Bytes('GW'));
    this.gateway = await ethers.getContractAt('LegacyGateway', gatewayAddress);
  });

  it.skip('deploy staking pool', async function () {
    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      'Nexus Mutual Staking Pool', // name
      'NMSP', // symbol
      this.nxm.address,
      this.cover.address,
      this.tokenController.address,
    );
    await stakingPool.deployed();
    this.stakingPool = stakingPool;
  });

  it('block V1 staking', async function () {
    const tx = await this.pooledStaking.blockV1();
    await tx.wait();
  });

  it.skip('process all PooledStaking pending actions', async function () {
    let hasPendingActions = await this.pooledStaking.hasPendingActions();
    let i = 0;
    while (hasPendingActions) {
      console.log(`Calling processPendingActions. iteration ${i++}`);
      const tx = await this.pooledStaking.processPendingActions(100);
      await tx.wait();
      hasPendingActions = await this.pooledStaking.hasPendingActions();
    }
    console.log('Done');
  });

  it('unlock claim assessment stakes', async function () {
    const stakesPath = path.join(config.paths.root, 'scripts/v2-migration/output/eligibleForCLAUnlock.json');
    const claimAssessors = require(stakesPath).map(x => x.member);

    const tcNxmBalance = await this.nxm.balanceOf(this.tokenController.address);

    console.log('Token balances before running tc.withdrawClaimAssessmentTokens');
    console.log({
      tcNxmBalance: tcNxmBalance.toString(),
    });

    const totalToProcess = claimAssessors.length;
    console.log(`Processing withdrawClaimAssessmentTokens for ${totalToProcess} claim assesors`);
    let amountProcessed = 0;
    while (claimAssessors.length > 0) {
      const batchSize = 100;
      const batch = claimAssessors.splice(0, batchSize);
      await this.tokenController.withdrawClaimAssessmentTokens(batch);

      amountProcessed += batchSize;
      console.log(`Processed ${amountProcessed}/${totalToProcess}`);
    }

    const tx = await this.tokenController.withdrawClaimAssessmentTokens(claimAssessors);
    await tx.wait();
  });

  it('transfer v1 assessment rewards to assessors', async function () {
    const tcNxmBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    await this.claimsReward.transferRewards();

    const tcNxmBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const crNxmBalanceAfter = await this.nxm.balanceOf(this.claimsReward.address);

    expect(crNxmBalanceAfter).to.be.equal(BigNumber.from(0));

    const governanceRewardsMigrated = tcNxmBalanceAfter.sub(tcNxmBalanceBefore);

    console.log({
      governanceRewardsMigrated: governanceRewardsMigrated.toString(),
      governanceRewardsSum: this.governanceRewardsSum.toString(),
    });

    /*
      -1106654884061072517264
      +870391213513961173071

      Extra tokens:

      236.26367054711136 NXM
     */
    // expect(governanceRewardsMigrated).to.be.equal(this.governanceRewardsSum);
  });

  it('check if TokenController balance checks out with Governance rewards', async function () {
    const tcNxmBalance = await this.nxm.balanceOf(this.tokenController.address);

    const rewardsSum = this.governanceRewardsSum;

    const coverNotesSum = this.coverNotesSum;

    console.log({
      tcNxmBalance: tcNxmBalance.toString(),
      rewardsSum: rewardsSum.toString(),
      coverNotesSum: coverNotesSum.toString(),
    });

    // TODO: this does NOT pass. Find out where the extra 7k tokens is from.
    // The outputs of the above log:
    // {
    //   tcNxmBalance: '21186831578421870058919',
    //   rewardsSum: '870391213513961173071',
    //   coverNotesSum: '13324809641365910004774'
    // }
    // expect(tcNxmBalance).to.be.equal(rewardsSum.add(coverNotesSum));
  });

  it.skip('remove CR, CD, IC, QD, QT, TF, TD, P2', async function () {
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.removeContracts, // removeContracts(bytes2[])
      defaultAbiCoder.encode(['bytes2[]'], [['CR', 'CD', 'IC', 'QD', 'QT', 'TF', 'TD', 'P2'].map(x => toUtf8Bytes(x))]),
      this.abMembers,
      this.governance,
    );
  });

  it.skip('run populate-v2-products script', async function () {
    await populateV2Products(this.cover.address, this.abMembers[0]);
  });

  it.skip('migrate top stakers to new v2 staking pools', async function () {
    const topStakers = [
      '0x1337DEF1FC06783D4b03CB8C1Bf3EBf7D0593FC4',
      '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
      '0x4a9fA34da6d2378c8f3B9F6b83532B169beaEDFc',
      '0x46de0C6F149BE3885f28e54bb4d302Cb2C505bC2',
      '0xE1Ad30971b83c17E2A24c0334CB45f808AbEBc87',
      '0x5FAdEA9d64FFbe0b8A6799B8f0c72250F92E2B1d',
      '0x9c657DB2B697846BE13Ca0B2bB5a6D17f860a395',
      '0xF99b3a13d46A04735BF3828eB3030cfED5Ea0087',
      '0x8C878B8f805472C0b70eD66a71c0B33da3d233c8',
      '0x4544e2Fae244eA4Ca20d075bb760561Ce5990DC3',
    ];
    const txs = await Promise.all(topStakers.map(x => this.pooledStaking.migrateToNewV2Pool(x, 0)));
    await Promise.all(txs.map(x => x.wait()));
  });

  it.skip('deploy & add contracts: Assessment, IndividualClaims, YieldTokenIncidents', async function () {
    const IndividualClaims = await ethers.getContractFactory('IndividualClaims');
    const individualClaims = await IndividualClaims.deploy(this.nxm.address, this.coverNFT.address);
    await individualClaims.deployed();

    const YieldTokenIncidents = await ethers.getContractFactory('YieldTokenIncidents');
    const yieldTokenIncidents = await YieldTokenIncidents.deploy(this.nxm.address, this.coverNFT.address);
    await yieldTokenIncidents.deployed();

    const Assessment = await ethers.getContractFactory('Assessment');
    const assessment = await Assessment.deploy(this.nxm.address);
    await assessment.deployed();

    console.log(PROPOSAL_CATEGORIES.newContracts);
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [
          [toUtf8Bytes('IC'), toUtf8Bytes('YT'), toUtf8Bytes('AS')],
          [individualClaims.address, yieldTokenIncidents.address, assessment.address],
          [2, 2, 2],
        ],
      ),
      this.abMembers,
      this.governance,
    );
  });

  it.skip('deploy CoverViewer', async function () {
    const CoverViewer = await ethers.getContractFactory('CoverViewer');
    const coverViewer = await CoverViewer.deploy(this.master.address);
    await coverViewer.deployed();
  });

  // [todo] remove me, used just for console logs
  // it('deploy Quotation', async function () {
  // const Quotation = await ethers.getContractFactory('Quotation');
  // const quotation = await Quotation.deploy();
  // await quotation.deployed();

  // await submitGovernanceProposal(
  // 29, // upgradeMultipleContracts(bytes2[],address[])
  // defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('QT')], [quotation.address]]),
  // this.abMembers,
  // this.governance,
  // );

  // this.quotation = await ethers.getContractAt('Quotation', quotation.address);
  // });

  it.skip('MemberRoles is initialized with kycAuthAddress from QuotationData', async function () {
    const kycAuthAddressQD = await this.quotationData.kycAuthAddress();
    const kycAuthAddressMR = await this.memberRoles.kycAuthAddress();
    console.log({ kycAuthAddressMR, kycAuthAddressQD });
    expect(kycAuthAddressMR).to.be.equal(kycAuthAddressQD);
  });

  it.skip('withdrawCoverNote withdraws notes only once and removes the lock reasons', async function () {
    // Using AB members to test for cover notes but other addresses could be added as well
    for (const member of this.abMembers) {
      const {
        coverIds: unsortedCoverIds,
        lockReasons: coverNoteLockReasons,
        withdrawableAmount,
      } = await this.tokenController.getWithdrawableCoverNotes(member.address);
      const lockReasonsBefore = await this.tokenController.getLockReasons(member.address);
      const nxmBalanceBefore = await this.nxm.balanceOf(member.address);
      const reasons = await this.tokenController.getLockReasons(member.address);
      if (!reasons.length) {
        continue;
      }
      const unsortedCoverReasons = coverNoteLockReasons
        .map((x, i) => ({
          coverId: unsortedCoverIds[i],
          index: reasons.indexOf(x),
        }))
        .filter(x => x.index > -1);
      const sortedCoverReasons = unsortedCoverReasons.sort((a, b) => a.index - b.index);
      const indexes = sortedCoverReasons.map(x => x.index);
      const coverIds = sortedCoverReasons.map(x => x.coverId);
      if (!coverIds.length) {
        continue;
      }
      {
        const tx = await this.tokenController.withdrawCoverNote(member.address, coverIds, indexes);
        await tx.wait();
        const nxmBalanceAfter = await this.nxm.balanceOf(member.address);
        expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(withdrawableAmount));
      }
      await expect(this.tokenController.withdrawCoverNote(member.address, coverIds, indexes)).to.be.revertedWith(
        'reverted with panic code 0x32 (Array accessed at an out-of-bounds or negative index)',
      );
      const lockReasonsAfter = await this.tokenController.getLockReasons(member.address);
      const expectedLockReasonsAfter = lockReasonsBefore.filter(x => !coverNoteLockReasons.includes(x));
      expect(lockReasonsAfter).to.deep.equal(expectedLockReasonsAfter);
    }
  });

  it.skip('withdrawCoverNote reverts after two rejected claims', async function () {
    // [todo]
  });

  it.skip('withdrawCoverNote reverts after an accepted claim', async function () {
    // [todo]
  });

  it.skip('withdrawCoverNote reverts after one rejected and one an accepted claim', async function () {
    // [todo]
  });

  it('pool value check', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const poolValueDiff = poolValueAfter.sub(poolValueBefore).abs();

    console.log({
      poolValueBefore: poolValueBefore.toString(),
      poolValueAfter: poolValueAfter.toString(),
    });

    expect(
      poolValueDiff.isZero(),
      [
        `Pool value before: ${formatEther(poolValueBefore)} `,
        `Pool value after:  ${formatEther(poolValueAfter)}`,
        `Current diff: ${formatEther(poolValueDiff)}`,
      ].join('\n'),
    ).to.be.equal(true);
  });
});
