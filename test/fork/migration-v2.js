const { ethers, web3, network, config } = require('hardhat');
const fetch = require('node-fetch');
const { expect } = require('chai');
const path = require('path');

const { hex } = require('../utils').helpers;
const proposalCategories = require('../utils').proposalCategories;
const evm = require('./evm')();

const { BigNumber } = ethers;
const { AddressZero } = ethers.constants;
const { parseEther, formatEther, defaultAbiCoder, toUtf8Bytes, getAddress, keccak256, hexZeroPad } = ethers.utils;

// TODO Review constants
const getProductAddresses = require('../../scripts/v2-migration/products/get-products');
const getLegacyAssessmentRewards = require('../../scripts/get-legacy-assessment-rewards');
const getLockedInV1ClaimAssessment = require('../../scripts/get-locked-in-v1-claim-assessment');
const getWithdrawableCoverNotes = require('../../scripts/get-withdrawable-cover-notes');
const getGovernanceRewards = require('../../scripts/get-governance-rewards');
const populateV2Products = require('../../scripts/populate-v2-products');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const getV1CoverPrices = require('../../scripts/get-v1-cover-prices');

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

const MaxUint96 = '79228162514264337593543950335';

const ListIdForReceivers = 218;
const AddressListRegistry = '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff';

const MIN_POOL_ETH = 0;

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const MEMBER_ADDRESS = '0xd7cba5b9a0240770cfd9671961dae064136fa240';
const CLAIM_PAYABLE_ADDRESS = '0x748E712663510Bb417c1aBb1bca3d817447f118c';

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

let poolValueBefore;

async function submitGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert.equal(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
}

async function enableAsEnzymeReceiver(receiverAddress) {
  const comptroller = await ethers.getContractAt('IEnzymeV4Comptroller', ENZYME_COMPTROLLER_PROXY_ADDRESS);
  const vault = await ethers.getContractAt('IEnzymeV4Vault', ENZYMEV4_VAULT_PROXY_ADDRESS);
  const ownerAddress = await vault.getOwner();
  console.log('Enzyme vault owner address:', ownerAddress);

  // Unlock and funding vault owner
  const owner = await getSigner(ownerAddress);
  await evm.impersonate(ownerAddress);
  await evm.setBalance(ownerAddress, parseEther('1000'));

  // Update Enzyme vault receivers
  const selector = web3.eth.abi.encodeFunctionSignature('addToList(uint256,address[])');
  const receiverArgs = web3.eth.abi.encodeParameters(['uint256', 'address[]'], [ListIdForReceivers, [receiverAddress]]);
  await comptroller.connect(owner).vaultCallOnContract(AddressListRegistry, selector, receiverArgs);

  // Check that Enzyme vault receivers contains the Pool address
  const registry = await ethers.getContractAt('IAddressListRegistry', ENZYME_ADDRESS_LIST_REGISTRY);
  const inReceiverList = await registry.isInList(ListIdForReceivers, receiverAddress);
  assert.equal(inReceiverList, true);
}

describe('V2 upgrade', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    await getSigner('0x1eE3ECa7aEF17D1e74eD7C447CcBA61aC76aDbA9');

    // Get or revert snapshot if network is tenderly
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

  it('Initialize V1 contracts', async function () {
    const [deployer] = await ethers.getSigners();
    this.deployer = deployer;

    // TODO rename factory to make it obvious it fetches addresses and abis from version-data
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

  // Setup needed to test that `claimPayoutAddress` storage is cleaned up
  it('Add new claim payout address to MemberRoles', async function () {
    await evm.impersonate(MEMBER_ADDRESS);
    await evm.setBalance(MEMBER_ADDRESS, parseEther('1000'));
    const member = await getSigner(MEMBER_ADDRESS);
    await this.memberRoles.connect(member).setClaimPayoutAddress(CLAIM_PAYABLE_ADDRESS);

    const claimPayableAddressAfter = await this.memberRoles.getClaimPayoutAddress(MEMBER_ADDRESS);
    expect(claimPayableAddressAfter).to.be.equal(getAddress(CLAIM_PAYABLE_ADDRESS));
  });

  // Generates the ProductsV1 contract
  // TODO: We should generate the Products1.sol contract outside the fork test
  // either way, for this to work now, we must get rid of the get-sunset-products script
  // and use the generated file here
  it.skip('run get-products-v1 script', async function () {
    await getProductAddresses();
  });

  // TODO to be reviewed
  it.skip('run get-v1-cover-prices', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getV1CoverPrices(directProvider);
  });

  // TODO to be reviewed
  it.skip('run get-withdrawable-cover-notes', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getWithdrawableCoverNotes(directProvider, this.tokenController);
  });

  // TODO to be reviewed
  it.skip('compute total withdrawable cover notes', async function () {
    const eligibleForCoverNoteWithdrawPath = path.join(
      config.paths.root,
      'scripts/v2-migration/output/eligible-for-cover-note-withdraw.json',
    );
    const withdrawableCoverNotes = require(eligibleForCoverNoteWithdrawPath);

    const coverNotesSum = withdrawableCoverNotes.reduce(
      (sum, coverNote) => sum.add(BigNumber.from(coverNote.withdrawableAmount)),
      BigNumber.from(0),
    );

    // console.log({
    //   coverNotesSum: coverNotesSum.toString(),
    // });

    this.coverNotesSum = coverNotesSum;
  });

  // TODO to be reviewed
  it.skip('run get-governance-rewards script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getGovernanceRewards(directProvider);
  });

  // TODO to be reviewed
  it.skip('compute total governance rewards', async function () {
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

    // console.log({
    //   governanceRewardsSum: governanceRewardsSum.toString(),
    // });

    this.governanceRewardsSum = governanceRewardsSum;
  });

  // TODO to be reviewed
  // generates the LegacyClaimsReward contract with the transfer calls
  it.skip('run get-legacy-assessment-rewards script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getLegacyAssessmentRewards(directProvider);
  });

  // TODO to be reviewed
  // generates the eligibleForCLAUnlock.json file
  it.skip('run get-locked-in-v1-claim-assessment script', async function () {
    const directProvider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
    await getLockedInV1ClaimAssessment(directProvider);
  });

  it('Impersonate AB members', async function () {
    const { memberArray: abMembers } = await this.memberRoles.members(1);
    this.abMembers = [];
    for (const address of abMembers) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      this.abMembers.push(await getSigner(address));
    }
  });

  it('Add proposal category 42 (Add new contracts)', async function () {
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

  it('Add proposal category 43 (Remove contracts)', async function () {
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

  it('Edit proposal category 41 (Set Asset Swap Details)', async function () {
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

  it('Deploy ProductsV1.sol', async function () {
    const ProductsV1 = await ethers.getContractFactory('ProductsV1');
    const productsV1 = await ProductsV1.deploy();
    await productsV1.deployed();
    this.productsV1 = productsV1;
  });

  it('Deploy CoverNFT.sol', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const CoverNFT = await ethers.getContractFactory('CoverNFT');
    const coverNFT = await CoverNFT.deploy('Nexus Mutual Cover', 'NXC', coverProxyAddress);
    await coverNFT.deployed();
    this.coverNFT = coverNFT;
  });

  it('Deploy SwapOperator.sol', async function () {
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

  it('Deploy and upgrade Governance.sol', async function () {
    const Governance = await ethers.getContractFactory('Governance');
    const newGovernance = await Governance.deploy();
    await newGovernance.deployed();

    await submitGovernanceProposal(
      // upgradeMultipleContracts(bytes2[],address[])
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    this.governance = await ethers.getContractAt('Governance', this.governance.address);
  });

  it('Add empty new internal contract for Cover (CoverInitializer.sol - CO)', async function () {
    const CoverInitializer = await ethers.getContractFactory('CoverInitializer');
    const coverInitializer = await CoverInitializer.deploy();
    await coverInitializer.deployed();

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [[toUtf8Bytes('CO')], [coverInitializer.address], [2]], // 2 = proxy contract
      ),
      this.abMembers,
      this.governance,
    );

    // Check the master address of the empty cover contract is correct
    const coverAddress = await this.master.getLatestAddress(hex('CO'));
    const cover = await ethers.getContractAt('CoverInitializer', coverAddress);
    const storedMaster = await cover.master();
    expect(storedMaster).to.be.equal(this.master.address);
  });

  it('Deploy StakingPoolFactory.sol, StakingNFT.sol, StakingPool.sol', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    // StakingPoolFactory.sol
    const StakingPoolFactory = await ethers.getContractFactory('StakingPoolFactory');
    const stakingPoolFactory = await StakingPoolFactory.deploy(coverProxyAddress);
    await stakingPoolFactory.deployed();
    this.stakingPoolFactory = stakingPoolFactory;

    // StakingNFT.sol
    const StakingNFT = await ethers.getContractFactory('StakingNFT');
    this.stakingNFT = await StakingNFT.deploy(
      'Nexus Mutual Deposit',
      'NMD',
      stakingPoolFactory.address,
      coverProxyAddress,
    );

    // StakingPool.sol
    const StakingPool = await ethers.getContractFactory('StakingPool');
    const stakingPool = await StakingPool.deploy(
      this.stakingNFT.address,
      this.nxm.address,
      coverProxyAddress,
      this.tokenController.address,
      this.master.address,
    );
    await stakingPool.deployed();
    this.stakingPool = stakingPool;
  });

  it('Deploy and upgrade NXMaster.sol', async function () {
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

  // eslint-disable-next-line max-len
  it('Deploy & upgrade contracts: MR, MCR, CO, TC, PS, PriceFeedOracle, P1, CL (CoverMigrator), GW, CR', async function () {
    // CR - ClaimRewards.sol
    const ClaimsReward = await ethers.getContractFactory('LegacyClaimsReward');
    const newClaimsReward = await ClaimsReward.deploy(this.master.address, DAI_ADDRESS);
    await newClaimsReward.deployed();

    // TC - TokenController.sol
    const TokenController = await ethers.getContractFactory('TokenController');
    const tokenController = await TokenController.deploy(
      this.quotationData.address,
      newClaimsReward.address,
      this.stakingPoolFactory.address,
    );
    await tokenController.deployed();

    // MCR - MCR.sol
    const MCR = await ethers.getContractFactory('MCR');
    const mcr = await MCR.deploy(this.master.address);
    await mcr.deployed();

    // MR - MemberRoles.sol
    const MemberRoles = await ethers.getContractFactory('MemberRoles');
    const memberRoles = await MemberRoles.deploy();
    await memberRoles.deployed();

    // CO - Cover.sol
    const Cover = await ethers.getContractFactory('Cover');
    const cover = await Cover.deploy(
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    );
    await cover.deployed();

    // PS - PooledStaking.sol
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const PooledStaking = await ethers.getContractFactory('LegacyPooledStaking');
    const pooledStaking = await PooledStaking.deploy(coverProxyAddress, this.productsV1.address);
    await pooledStaking.deployed();

    // PriceFeedOracle.sol
    const PriceFeedOracle = await ethers.getContractFactory('PriceFeedOracle');
    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18];
    const priceFeedOracle = await PriceFeedOracle.deploy(assetAddresses, assetAggregators, assetDecimals);
    await priceFeedOracle.deployed();

    // P1 - Pool.sol
    const Pool = await ethers.getContractFactory('Pool');
    const pool = await Pool.deploy(
      this.master.address,
      priceFeedOracle.address,
      this.swapOperator.address,
      DAI_ADDRESS,
      STETH_ADDRESS,
      ENZYMEV4_VAULT_PROXY_ADDRESS,
    );
    await pool.deployed();
    // Enable Pool as Enzyme receiver
    await enableAsEnzymeReceiver(pool.address);

    // CL - CoverMigrator.sol
    const CoverMigrator = await ethers.getContractFactory('CoverMigrator');
    const coverMigrator = await CoverMigrator.deploy(this.quotationData.address, this.productsV1.address);
    await coverMigrator.deployed();

    // GW - Gateway.sol
    const Gateway = await ethers.getContractFactory('LegacyGateway');
    const gateway = await Gateway.deploy();
    await gateway.deployed();

    console.log(
      'Upgrade multiple contracts: MR - MemberRoles.sol, MC - MCR.sol, CO - Cover.sol, TC -' +
        ' TokenController.sol, PS - PooledStaking.sol, P1 - Pool.sol, CL - CoverMigrator.sol, GW - Gateway.sol',
    );
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]'],
        [
          [
            toUtf8Bytes('MR'),
            toUtf8Bytes('MC'),
            toUtf8Bytes('CO'),
            toUtf8Bytes('CR'),
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
            newClaimsReward.address,
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

    this.memberRoles = await ethers.getContractAt('MemberRoles', this.memberRoles.address);
    this.mcr = await ethers.getContractAt('MCR', mcr.address);
    this.cover = await ethers.getContractAt('Cover', coverProxyAddress);

    const tokenControllerAddress = await this.master.contractAddresses(toUtf8Bytes('TC'));
    this.tokenController = await ethers.getContractAt('TokenController', tokenControllerAddress);

    const pooledStakingAddress = await this.master.contractAddresses(toUtf8Bytes('PS'));
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', pooledStakingAddress);
    this.pool = pool;
    this.coverMigrator = await ethers.getContractAt('CoverMigrator', coverMigrator.address);

    const gatewayAddress = await this.master.contractAddresses(toUtf8Bytes('GW'));
    this.gateway = await ethers.getContractAt('LegacyGateway', gatewayAddress);

    this.claimsReward = newClaimsReward;
  });

  it('Cleanup storage in MemberRoles', async function () {
    const claimPayableAddressSlot = 15;
    const paddedSlot = hexZeroPad(claimPayableAddressSlot, 32);
    const paddedKey = hexZeroPad(MEMBER_ADDRESS, 32);
    const slot = keccak256(paddedKey + paddedSlot.slice(2));

    const storageValueBefore = await ethers.provider.getStorageAt(this.memberRoles.address, slot);
    const [claimPayableAddressBefore] = defaultAbiCoder.decode(['address'], storageValueBefore);

    expect(claimPayableAddressBefore).to.be.equal(CLAIM_PAYABLE_ADDRESS);

    await this.memberRoles.storageCleanup(['0xd7cba5b9a0240770cfd9671961dae064136fa240']);

    const storageValueAfter = await ethers.provider.getStorageAt(this.memberRoles.address, slot);
    const [claimPayableAddressAfter] = defaultAbiCoder.decode(['address'], storageValueAfter);
    expect(claimPayableAddressAfter).to.be.equal(AddressZero);
  });

  it('Call function to initialize Cover.sol', async function () {
    await this.cover.initialize();

    const storedGlobalCapacityRatio = await this.cover.globalCapacityRatio();
    expect(storedGlobalCapacityRatio).to.be.equal(20000); // x2

    const storedGlobalRewardsRatio = await this.cover.globalRewardsRatio();
    expect(storedGlobalRewardsRatio).to.be.equal(5000); // 50%
  });

  it('Call function to block V1 staking', async function () {
    const tx = await this.pooledStaking.blockV1();
    await tx.wait();
  });

  // TODO review from here on
  it.skip('unlock claim assessment stakes', async function () {
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

  it.skip('transfer v1 assessment rewards to assessors', async function () {
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

  it.skip('check if TokenController balance checks out with Governance rewards', async function () {
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

  it('remove CR, CD, IC, QD, QT, TF, TD, P2', async function () {
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

  it('Process all PooledStaking pending actions', async function () {
    let hasPendingActions = await this.pooledStaking.hasPendingActions();
    let i = 0;
    while (hasPendingActions) {
      console.log(`Calling processPendingActions(). iteration ${i++}`);
      const tx = await this.pooledStaking.processPendingActions(100);
      await tx.wait();
      hasPendingActions = await this.pooledStaking.hasPendingActions();
    }
  });

  // TODO: One of the price assertions fails for Hugh's pool
  it.skip('migrate top stakers to new v2 staking pools', async function () {
    const ARMOR_NFT = '0x1337def1fc06783d4b03cb8c1bf3ebf7d0593fc4';
    const NEXUSMUTUAL_FOUNDATION = '0x963df0066ff8345922df88eebeb1095be4e4e12e';
    const HUGH = '0x87b2a7559d85f4653f13e6546a14189cd5455d45';
    const topStakers = [ARMOR_NFT, NEXUSMUTUAL_FOUNDATION, HUGH];

    const depositAmounts = {};
    await Promise.all(
      topStakers.map(async staker => {
        const deposit = await this.pooledStaking.stakerDeposit(staker);
        console.log(`Staker ${staker} deposit = ${deposit.toString()}`);
        depositAmounts[staker] = deposit;
      }),
    );

    const nxmBalancesBefore = {};
    await Promise.all(
      topStakers.map(async staker => {
        nxmBalancesBefore[staker] = await this.nxm.balanceOf(staker);
      }),
    );

    for (const staker of topStakers) {
      await this.pooledStaking.migrateToNewV2Pool(staker);
    }

    const stakingPoolCount = await this.stakingPoolFactory.stakingPoolCount();

    // Armor has 2 pools therefore +1
    expect(stakingPoolCount).to.be.equal(topStakers.length + 1);

    const armorPool0Id = 0;
    const armorPool1Id = 1;
    const nexusFoundationPoolId = 2;
    const hughPoolId = 3;
    const { deposits: armorPool0Balance } = await this.tokenController.stakingPoolNXMBalances(armorPool0Id);
    const expectedArmorPool0Balance = depositAmounts[ARMOR_NFT].mul(75).div(100).mul(95).div(100);
    expect(armorPool0Balance.div(10)).to.be.equal(expectedArmorPool0Balance.div(10));

    const { deposits: armorPool1Balance } = await this.tokenController.stakingPoolNXMBalances(armorPool1Id);
    const expectedArmorPool1Balance = depositAmounts[ARMOR_NFT].mul(25).div(100).mul(95).div(100);
    expect(armorPool1Balance.div(10)).to.be.equal(expectedArmorPool1Balance.div(10));

    const { deposits: nexusFoundationBalance } = await this.tokenController.stakingPoolNXMBalances(
      nexusFoundationPoolId,
    );
    expect(nexusFoundationBalance.div(10)).to.be.equal('0');

    const { deposits: hughPoolBalance } = await this.tokenController.stakingPoolNXMBalances(hughPoolId);
    const expectedHughBalance = depositAmounts[HUGH];
    expect(hughPoolBalance.div(10)).to.be.equal(expectedHughBalance.div(10));

    const nxmBalancesAfter = {};
    await Promise.all(
      topStakers.map(async staker => {
        nxmBalancesAfter[staker] = await this.nxm.balanceOf(staker);
      }),
    );

    // assert each staker gets the unlocked NXM tokens back
    const armorNFTBalanceIncreaseDelta = nxmBalancesAfter[ARMOR_NFT].sub(nxmBalancesBefore[ARMOR_NFT]).sub(
      depositAmounts[ARMOR_NFT].sub(expectedArmorPool0Balance),
    );
    expect(armorNFTBalanceIncreaseDelta).to.be.lessThan(10);

    const hughBalanceIncreaseDelta = nxmBalancesAfter[HUGH].sub(nxmBalancesBefore[HUGH]).sub(
      depositAmounts[HUGH].sub(expectedHughBalance),
    );
    expect(hughBalanceIncreaseDelta).to.be.lessThan(10);

    expect(nxmBalancesAfter[NEXUSMUTUAL_FOUNDATION].sub(nxmBalancesBefore[NEXUSMUTUAL_FOUNDATION])).to.be.equal(
      depositAmounts[NEXUSMUTUAL_FOUNDATION],
    );

    // assert deposits are now 0 for each staker
    await Promise.all(
      topStakers.map(async staker => {
        const deposit = await this.pooledStaking.stakerDeposit(staker);
        expect(deposit).to.be.equal(0);
      }),
    );

    // Assert deposit for Armor Pool 0
    const v2ProductAddresses = require(path.join(
      config.paths.root,
      'scripts/v2-migration/products/output/v2ProductAddresses.json',
    ));

    const pooledStaking = this.pooledStaking;
    async function assertPrices(stakingPool, stakerAddress) {
      const contracts = await pooledStaking.stakerContractsArray(stakerAddress);

      const contractIds = contracts.map(contract => v2ProductAddresses.indexOf(contract));

      for (const i of contractIds) {
        if (i === -1) {
          // contract was not migrated to v2 (deprecated and sunset)
          continue;
        }
        const productPrice = await pooledStaking.getV1PriceForProduct(i);
        if (productPrice.toString() === MaxUint96) {
          // it's not a supported product
          continue;
        }

        const stakedProduct = await stakingPool.products(i);

        console.log(`Checking product with id: ${i}`);

        console.log({
          productPrice: productPrice.toString(),
          stakedProductTargetPrice: stakedProduct.targetPrice.toString(),
          stakedProductBumpedPrice: stakedProduct.bumpedPrice.toString(),
        });
        expect(stakedProduct.targetPrice).to.be.equal(productPrice.div(BigNumber.from((1e16).toString())));
        expect(stakedProduct.bumpedPrice).to.be.equal(productPrice.div(BigNumber.from((1e16).toString())));
      }
    }

    console.log(`Checking prices for Armor Pool 0`);
    const armorStakingPool0 = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(0));
    await assertPrices(armorStakingPool0, ARMOR_NFT);

    console.log(`Checking prices for Armor Pool 1`);
    const armorStakingPool1 = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(1));
    await assertPrices(armorStakingPool1, ARMOR_NFT);

    console.log(`Checking prices for Nexus Foundation Pool`);
    const nexusFoundationPool = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(2));
    await assertPrices(nexusFoundationPool, NEXUSMUTUAL_FOUNDATION);

    console.log(`Checking prices for Hugh Pool`);
    const hughPool = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(3));
    await assertPrices(hughPool, HUGH);
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

  it.skip('pool value check', async function () {
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
