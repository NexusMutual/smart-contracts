const { expect } = require('chai');
const { ethers, web3, network } = require('hardhat');
const fetch = require('node-fetch');

const evm = require('./evm')();
const { hex } = require('../utils').helpers;
const proposalCategories = require('../utils').proposalCategories;
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');

const { BigNumber } = ethers;
const { AddressZero, Two } = ethers.constants;
const { parseEther, formatEther, defaultAbiCoder, toUtf8Bytes, getAddress, keccak256, hexZeroPad } = ethers.utils;

const getProductAddresses = require('../../scripts/v2-migration/get-v2-products');
const getV1CoverPrices = require('../../scripts/v2-migration/get-v1-cover-prices');
const getGovernanceRewards = require('../../scripts/v2-migration/get-governance-rewards');
const getClaimAssessmentRewards = require('../../scripts/v2-migration/get-claim-assessment-rewards');
const getClaimAssessmentStakes = require('../../scripts/v2-migration/get-claim-assessment-stakes');
const getTCLockedAmount = require('../../scripts/v2-migration/get-tc-locked-amount');
const getCNLockedAmount = require('../../scripts/v2-migration/get-cn-locked');
// TODO Review
const populateV2Products = require('../../scripts/populate-v2-products');

const PRODUCT_ADDRESSES_OUTPUT_PATH = '../../scripts/v2-migration/output/product-addresses.json';
const GV_REWARDS_OUTPUT_PATH = '../../scripts/v2-migration/output/governance-rewards.json';
const CLA_REWARDS_OUTPUT_PATH = '../../scripts/v2-migration/output/claim-assessment-rewards.json';
const CLA_STAKES_OUTPUT_PATH = '../../scripts/v2-migration/output/claim-assessment-stakes.json';
const TC_LOCKED_AMOUNT_OUTPUT_PATH = '../../scripts/v2-migration/output/tc-locked-amount.json';
const CN_LOCKED_AMOUNT_OUTPUT_PATH = '../../scripts/v2-migration/output/cn-locked-amount.json';

const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';
const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';
const ENZYME_FUND_VALUE_CALCULATOR_ROUTER = '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9';
const ENZYME_COMPTROLLER_PROXY_ADDRESS = '0xa5bf4350da6193b356ac15a3dbd777a687bc216e';
const ENZYME_ADDRESS_LIST_REGISTRY = '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff';
const ListIdForReceivers = 218;

const DAI_PRICE_FEED_ORACLE_AGGREGATOR = '0x773616E4d11A78F511299002da57A0a94577F1f4';
const STETH_PRICE_FEED_ORACLE_AGGREGATOR = '0x86392dC19c0b719886221c78AB11eb8Cf5c52812';
const ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR = '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7';

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const MEMBER_ADDRESS = '0xd7cba5b9a0240770cfd9671961dae064136fa240';
const CLAIM_PAYABLE_ADDRESS = '0x748E712663510Bb417c1aBb1bca3d817447f118c';

const MaxUint96 = Two.pow(96).sub(1);

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
  await comptroller.connect(owner).vaultCallOnContract(ENZYME_ADDRESS_LIST_REGISTRY, selector, receiverArgs);

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

    // Pool value related info
    this.poolValueBefore = await this.pool.getPoolValueInEth();

    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);

    this.stEth = await ethers.getContractAt('ERC20Mock', STETH_ADDRESS);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);

    this.enzymeShares = await ethers.getContractAt('ERC20Mock', ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);
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

  // Generates ProductsV1.sol contract
  it('Generate ProductsV1.sol with all products to be migrated to V2', async function () {
    await getProductAddresses();
  });

  it('Get V1 cover prices', async function () {
    await getV1CoverPrices();
  });

  it('Get governance rewards', async function () {
    await getGovernanceRewards(ethers.provider);
  });

  it('Get claim assessment rewards and generate transfer calls in LegacyClaimsReward.sol', async function () {
    await getClaimAssessmentRewards(ethers.provider);
  });

  it('Get claim assessment stakes', async function () {
    await getClaimAssessmentStakes(ethers.provider);
  });

  it('Get TC locked amount', async function () {
    await getTCLockedAmount(ethers.provider);
  });

  it('Check balance of CR equals CLA + GV rewards computed above', async function () {
    const GV_REWARDS_OUTPUT = require(GV_REWARDS_OUTPUT_PATH);
    const CLA_REWARDS_OUTPUT = require(CLA_REWARDS_OUTPUT_PATH);
    const CLA_STAKES_OUTPUT = require(CLA_STAKES_OUTPUT_PATH);
    const crBalance = await this.nxm.balanceOf(this.claimsReward.address);

    this.governanceRewardsSum = Object.values(GV_REWARDS_OUTPUT).reduce(
      (sum, reward) => sum.add(reward),
      BigNumber.from(0),
    );
    this.claRewardsSum = CLA_REWARDS_OUTPUT.reduce((sum, reward) => sum.add(reward.reward), BigNumber.from(0));
    this.claStakesSum = Object.values(CLA_STAKES_OUTPUT).reduce((sum, amount) => sum.add(amount), BigNumber.from(0));

    console.log({
      governanceRewardsSum: formatEther(this.governanceRewardsSum),
      claRewardsSum: formatEther(this.claRewardsSum),
      totalRewardsInCR: formatEther(this.governanceRewardsSum.add(this.claRewardsSum)),
      crBalance: formatEther(crBalance),
      extraAmount: formatEther(crBalance.sub(this.governanceRewardsSum.add(this.claRewardsSum))),
    });

    // Currently there are still 1.655901756826619689 NXM extra when comparing
    // the sum of governance rewards and claim assessment rewards with the balance of CR
    expect(crBalance.sub(this.governanceRewardsSum).sub(this.claRewardsSum)).lt(parseEther(2));
  });

  it('Check balance of TC equals sum of all locked NXM', async function () {
    const TC_LOCKED_AMOUNT_OUTPUT = require(TC_LOCKED_AMOUNT_OUTPUT_PATH);
    this.TCLockedAmount = Object.values(TC_LOCKED_AMOUNT_OUTPUT).reduce(
      (sum, amount) => sum.add(amount),
      BigNumber.from(0),
    );
    const tcBalanceBeforeUpgrade = await this.nxm.balanceOf(this.tokenController.address);

    console.log({
      TCBalance: formatEther(tcBalanceBeforeUpgrade),
      TCLockedAmount: formatEther(this.TCLockedAmount),
      Diff: formatEther(tcBalanceBeforeUpgrade.sub(this.TCLockedAmount)),
    });

    expect(tcBalanceBeforeUpgrade).to.be.equal(this.TCLockedAmount);
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

  it('Add proposal category 43 (Add new contracts)', async function () {
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

  it('Add proposal category 44 (Remove contracts)', async function () {
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
    this.productsV1 = await ethers.deployContract('ProductsV1');
  });

  it('Deploy SwapOperator.sol', async function () {
    this.swapOperator = await ethers.deployContract('SwapOperator', [
      COWSWAP_SETTLEMENT, // _cowSettlement
      SWAP_CONTROLLER, // _swapController
      this.master.address, // _master
      WETH_ADDRESS, // _weth
      ENZYMEV4_VAULT_PROXY_ADDRESS,
      ENZYME_FUND_VALUE_CALCULATOR_ROUTER,
      0, // Min Pool ETH
    ]);
  });

  it('Deploy and upgrade Governance.sol', async function () {
    const newGovernance = await ethers.deployContract('Governance');

    await submitGovernanceProposal(
      // upgradeMultipleContracts(bytes2[],address[])
      PROPOSAL_CATEGORIES.upgradeMultipleContracts,
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [[toUtf8Bytes('GV')], [newGovernance.address]]),
      this.abMembers,
      this.governance,
    );

    this.governance = await ethers.getContractAt('Governance', this.governance.address);
  });

  it(
    'Add empty new internal contracts for Cover and StakingProducts' + '(InternalProxyInitializer.sol - CO, SP)',
    async function () {
      const internalProxyInitializer = await ethers.deployContract('InternalProxyInitializer');

      /*
       This initializer is necessary to solve for the circular dependency between: Cover <-> StakingNFT
       by having the permanent proxy address ready when passing in the dependencies.

        StakingProducts can be deployed once Cover and StakingPoolFactory is deployed, however it would require another
        addNewInternalContracts call to add it, therefore it makes sense to create the proxy for it here;

        Then, when the bulk upgrade of all smart contracts happens, both CO and SP can be upgraded to their final
        implementations (no extra gov proposal is necessary in between)

       */
      await submitGovernanceProposal(
        PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
        defaultAbiCoder.encode(
          ['bytes2[]', 'address[]', 'uint256[]'],
          [
            [toUtf8Bytes('CO'), toUtf8Bytes('SP')],
            [internalProxyInitializer.address, internalProxyInitializer.address],
            [2, 2],
          ], // 2 = proxy contract
        ),
        this.abMembers,
        this.governance,
      );

      // Check the master address of the empty cover contract is correct
      const coverAddress = await this.master.getLatestAddress(hex('CO'));
      const cover = await ethers.getContractAt('Cover', coverAddress);
      const storedMaster = await cover.master();
      expect(storedMaster).to.be.equal(this.master.address);

      const stakingProductsAddress = await this.master.getLatestAddress(hex('SP'));

      this.cover = cover;
      this.stakingProducts = await ethers.getContractAt('StakingProducts', stakingProductsAddress);
    },
  );

  it('Deploy CoverNFT.sol', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    this.coverNFT = await ethers.deployContract('CoverNFT', ['Nexus Mutual Cover', 'NXC', coverProxyAddress]);
  });

  it('Deploy StakingPoolFactory.sol, StakingNFT.sol, StakingPool.sol', async function () {
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    // StakingPoolFactory.sol
    this.stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [coverProxyAddress]);

    // StakingNFT.sol
    this.stakingNFT = await ethers.deployContract('StakingNFT', [
      'Nexus Mutual Deposit',
      'NMD',
      this.stakingPoolFactory.address,
      coverProxyAddress,
    ]);

    // StakingPool.sol
    this.stakingPool = await ethers.deployContract('StakingPool', [
      this.stakingNFT.address,
      this.nxm.address,
      coverProxyAddress,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);
  });

  it('Deploy and upgrade NXMaster.sol', async function () {
    const master = await ethers.deployContract('NXMaster');

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
    const newClaimsReward = await ethers.deployContract('LegacyClaimsReward', [this.master.address, DAI_ADDRESS]);

    // TC - TokenController.sol
    const tokenController = await ethers.deployContract('TokenController', [
      this.quotationData.address,
      newClaimsReward.address,
      this.stakingPoolFactory.address,
      this.nxm.address,
    ]);

    // MCR - MCR.sol
    const mcr = await ethers.deployContract('MCR', [this.master.address]);

    // MR - MemberRoles.sol
    const memberRoles = await ethers.deployContract('MemberRoles', [this.nxm.address]);

    // CO - Cover.sol
    const cover = await ethers.deployContract('Cover', [
      this.coverNFT.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingPool.address,
    ]);

    // PS - PooledStaking.sol
    const coverProxyAddress = await this.master.contractAddresses(toUtf8Bytes('CO'));
    const pooledStaking = await ethers.deployContract('LegacyPooledStaking', [
      coverProxyAddress,
      this.productsV1.address,
      this.stakingNFT.address,
    ]);

    // PriceFeedOracle.sol
    const assetAddresses = [DAI_ADDRESS, STETH_ADDRESS, ENZYMEV4_VAULT_PROXY_ADDRESS];
    const assetAggregators = [
      DAI_PRICE_FEED_ORACLE_AGGREGATOR,
      STETH_PRICE_FEED_ORACLE_AGGREGATOR,
      ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR,
    ];
    const assetDecimals = [18, 18, 18];
    const priceFeedOracle = await ethers.deployContract('PriceFeedOracle', [
      assetAddresses,
      assetAggregators,
      assetDecimals,
    ]);

    // P1 - Pool.sol
    const pool = await ethers.deployContract('Pool', [
      this.master.address,
      priceFeedOracle.address,
      this.swapOperator.address,
      DAI_ADDRESS,
      STETH_ADDRESS,
      ENZYMEV4_VAULT_PROXY_ADDRESS,
      this.nxm.address,
    ]);
    // Enable Pool as Enzyme receiver
    await enableAsEnzymeReceiver(pool.address);

    // CL - CoverMigrator.sol
    const coverMigrator = await ethers.deployContract('CoverMigrator', [
      this.quotationData.address,
      this.productsV1.address,
    ]);

    // GW - Gateway.sol
    const gateway = await ethers.deployContract('LegacyGateway');

    // SP - StakingProduct.sol
    const stakingProducts = await ethers.deployContract('StakingProducts', [
      this.cover.address,
      this.stakingPool.address,
    ]);

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
            toUtf8Bytes('SP'),
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
            stakingProducts.address,
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

  it('Pool value check', async function () {
    const poolValueAfter = await this.pool.getPoolValueInEth();
    const poolValueDiff = poolValueAfter.sub(this.poolValueBefore);

    const ethBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const daiBalanceAfter = await this.dai.balanceOf(this.pool.address);
    const stEthBalanceAfter = await this.stEth.balanceOf(this.pool.address);
    const enzymeSharesBalanceAfter = await this.enzymeShares.balanceOf(this.pool.address);

    console.log({
      poolValueBefore: formatEther(this.poolValueBefore),
      poolValueAfter: formatEther(poolValueAfter),
      poolValueDiff: formatEther(poolValueDiff),
      ethBalanceBefore: formatEther(this.ethBalanceBefore),
      ethBalanceAfter: formatEther(ethBalanceAfter),
      ethBalanceDiff: formatEther(ethBalanceAfter.sub(this.ethBalanceBefore)),
      daiBalanceBefore: formatEther(this.daiBalanceBefore),
      daiBalanceAfter: formatEther(daiBalanceAfter),
      daiBalanceDiff: formatEther(daiBalanceAfter.sub(this.daiBalanceBefore)),
      stEthBalanceBefore: formatEther(this.stEthBalanceBefore),
      stEthBalanceAfter: formatEther(stEthBalanceAfter),
      stEthBalanceDiff: formatEther(stEthBalanceAfter.sub(this.stEthBalanceBefore)),
      enzymeSharesBalanceBefore: formatEther(this.enzymeSharesBalanceBefore),
      enzymeSharesBalanceAfter: formatEther(enzymeSharesBalanceAfter),
      enzymeSharesBalanceDiff: formatEther(enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore)),
    });

    // Why 2 wei difference?
    expect(poolValueDiff.abs(), 'Pool value in ETH should be the same').lessThanOrEqual(BigNumber.from(2));
    expect(stEthBalanceAfter.sub(this.stEthBalanceBefore).abs(), 'stETH balance should be the same').lessThanOrEqual(
      BigNumber.from(2),
    );
    expect(ethBalanceAfter.sub(this.ethBalanceBefore), 'ETH balance should be the same').to.be.equal(0);
    expect(daiBalanceAfter.sub(this.daiBalanceBefore), 'DAI balance should be the same').to.be.equal(0);
    expect(
      enzymeSharesBalanceAfter.sub(this.enzymeSharesBalanceBefore),
      'Enzyme shares balance should be the same',
    ).to.be.equal(0);
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

  it('Transfer CLA rewards to assessors and GV rewards to TC', async function () {
    const tcNxmBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    await this.claimsReward.transferRewards();

    const tcNxmBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const crNxmBalanceAfter = await this.nxm.balanceOf(this.claimsReward.address);

    expect(crNxmBalanceAfter).to.be.equal(BigNumber.from(0));
    // Currently there are 1.655901756826619689 extra NXM transferred from CR to TC
    // (compared to our expected GV rewards calculated above)
    // expect(tcNxmBalanceAfter.sub(tcNxmBalanceBefore)).to.be.equal(this.governanceRewardsSum);
    console.log({
      tcNxmBalanceBefore: formatEther(tcNxmBalanceBefore),
      tcNxmBalanceAfter: formatEther(tcNxmBalanceAfter),
      expectedGVRewards: formatEther(this.governanceRewardsSum),
      tcBalanceDiff: formatEther(tcNxmBalanceAfter.sub(tcNxmBalanceBefore)),
      crNxmBalanceAfter: formatEther(crNxmBalanceAfter),
    });
  });

  it('Check all members with CLA stakes can withdraw & TC has the correct balance afterwards', async function () {
    const CLA_STAKES_OUTPUT = require(CLA_STAKES_OUTPUT_PATH);
    const tcBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    // Withdraw CLA stakes for all members
    for (const member of Object.keys(CLA_STAKES_OUTPUT)) {
      const memberBalanceBefore = await this.nxm.balanceOf(member);
      await this.tokenController.withdrawClaimAssessmentTokens([member]);
      const memberBalanceAfter = await this.nxm.balanceOf(member);
      expect(memberBalanceAfter.sub(memberBalanceBefore)).to.be.equal(CLA_STAKES_OUTPUT[member]);
    }

    const tcBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const tcBalanceDiff = tcBalanceBefore.sub(tcBalanceAfter);
    expect(tcBalanceDiff).to.be.equal(this.claStakesSum);

    console.log({
      tcBalanceBefore: formatEther(tcBalanceBefore),
      tcBalanceAfter: formatEther(tcBalanceAfter),
      tcBalanceDiff: formatEther(tcBalanceDiff),
      claStakesSum: formatEther(this.claStakesSum),
      tcBalanceDiffMinusCLAStakes: formatEther(tcBalanceDiff.sub(this.claStakesSum)),
    });

    // Attempt to withdraw CLA stakes for all members again, and assert that their balances don't change
    for (const member of Object.keys(CLA_STAKES_OUTPUT)) {
      const memberBalanceBefore = await this.nxm.balanceOf(member);
      await this.tokenController.withdrawClaimAssessmentTokens([member]);
      const memberBalanceAfter = await this.nxm.balanceOf(member);
      expect(memberBalanceAfter.sub(memberBalanceBefore)).to.be.equal(0);
    }
  });

  it('Get CN locked amount', async function () {
    await getCNLockedAmount(ethers.provider);
  });

  it('Check all members with CN locked NXM can withdraw & TC has the correct balance afterwards', async function () {
    const CN_LOCKED_AMOUNT_OUTPUT = require(CN_LOCKED_AMOUNT_OUTPUT_PATH);
    const tcBalanceBefore = await this.nxm.balanceOf(this.tokenController.address);

    // Withdraw CN token for all members
    for (const lock of CN_LOCKED_AMOUNT_OUTPUT) {
      const memberBalanceBefore = await this.nxm.balanceOf(lock.member);
      await this.tokenController.withdrawCoverNote(lock.member, lock.coverIds, lock.lockReasonIndexes);
      const memberBalanceAfter = await this.nxm.balanceOf(lock.member);
      expect(memberBalanceAfter.sub(memberBalanceBefore)).to.be.equal(lock.amount);

      const lockReasonsCount = (await this.tokenController.getLockReasons(lock.member)).length;
      expect(lockReasonsCount).lte(1);
    }

    const tcBalanceAfter = await this.nxm.balanceOf(this.tokenController.address);
    const tcBalanceDiff = tcBalanceBefore.sub(tcBalanceAfter);
    const cnLockedAmountSum = BigNumber.from(
      CN_LOCKED_AMOUNT_OUTPUT.reduce((acc, curr) => acc.add(curr.amount), BigNumber.from(0)),
    );

    console.log({
      tcBalanceBefore: formatEther(tcBalanceBefore),
      tcBalanceAfter: formatEther(tcBalanceAfter),
      cnLockedAmountSum: formatEther(cnLockedAmountSum),
      tcBalanceDiff: formatEther(tcBalanceDiff),
      tcBalanceDiffMinusCNLockedSum: formatEther(tcBalanceDiff.sub(cnLockedAmountSum)),
    });

    expect(tcBalanceDiff).to.be.equal(cnLockedAmountSum);
  });

  // TODO review
  it('run populate-v2-products script', async function () {
    await populateV2Products(this.cover.address, this.abMembers[0]);
  });

  // TODO review
  // We should also read
  // `const { amount, lastDistributionRound } = await ps.accumulatedRewards(coverable);`
  // and check if the amount > 0
  // Also, we should iterate through all products, in case we deprecated something that had a cover buy since the
  // last reward distribution round
  it('Call LegacyPooledStaking.pushRewards for all non-deprecated contracts', async function () {
    const PRODUCT_ADDRESSES_OUTPUT = require(PRODUCT_ADDRESSES_OUTPUT_PATH);
    const productAddresses = PRODUCT_ADDRESSES_OUTPUT.map(address => address.toLowerCase());

    /**
     * pushRewards is affected by 2 other code flows:
     * accumulateRewards (that itself calls pushRewards and accumulates rewards)
     * pushBurn (that itself calls pushRewards)
     *
     * Post bulk upgrade to v2 contracts at the step:
     * Deploy & upgrade contracts: MR, MCR, CO, TC, PS, PriceFeedOracle, P1, CL (CoverMigrator), GW, CR
     *
     * There is no other code path that can trigger accumulateRewards and pushBurn.
     */

    console.log(`Call pushRewards with ${productAddresses.length} product addresses.`);
    await this.pooledStaking.pushRewards(productAddresses);
  });

  // TODO review
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

  it('deploys StakingViewer', async function () {
    this.stakingViewer = await ethers.deployContract('StakingViewer', [
      this.master.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
      this.stakingProducts.address,
    ]);
  });

  it('Migrate selected stakers to their own staking pools', async function () {
    const ARMOR_STAKER = '0x1337def1fc06783d4b03cb8c1bf3ebf7d0593fc4';
    const FOUNDATION = '0x963df0066ff8345922df88eebeb1095be4e4e12e';
    const HUGH = '0x87b2a7559d85f4653f13e6546a14189cd5455d45';
    const ARMOR_MANAGER = '0xFa760444A229e78A50Ca9b3779f4ce4CcE10E170';
    const INITIAL_POOL_ID = 1;

    const selectedStakers = [FOUNDATION, HUGH, ARMOR_STAKER];

    console.log('Checking that selected stakers cannot withdraw independently');
    for (const staker of selectedStakers) {
      // pooledStaking.withdraw(uint) is not verified here for simplicity; it follows the exact same code path
      await expect(this.pooledStaking.connect(this.abMembers[0]).withdrawForUser(staker)).to.be.revertedWith(
        'Not allowed to withdraw',
      );
    }

    console.log('Checking that non selected stakers cannot be migrated automatically');
    await expect(
      this.pooledStaking.migrateToNewV2Pool('0x46de0C6F149BE3885f28e54bb4d302Cb2C505bC2'),
    ).to.be.revertedWith('You are not authorized to migrate this staker');

    // Get stakers current deposits in PooledStaking
    const depositInPS = {};
    await Promise.all(
      selectedStakers.map(async staker => {
        const deposit = await this.pooledStaking.stakerDeposit(staker);
        console.log(`Staker ${staker} deposit = ${deposit.toString()}`);
        depositInPS[staker] = deposit;
      }),
    );

    console.log('Deposits in PS');
    console.log({ depositInPS });

    // Get stakers NXM balances before the migration
    const nxmBalancesBefore = {};
    await Promise.all(
      selectedStakers.map(async staker => {
        nxmBalancesBefore[staker] = await this.nxm.balanceOf(staker);
      }),
    );

    // Get staker PS stakes before the migration
    const stakesInPSBefore = {};
    for (const staker of selectedStakers) {
      const stakerProducts = await this.pooledStaking.stakerContractsArray(staker);
      const productStakes = {};

      for (const product of stakerProducts) {
        productStakes[product] = await this.pooledStaking.stakerContractStake(staker, product);
      }
      stakesInPSBefore[staker] = productStakes;
    }

    console.log('Migrating selected stakers to their own staking pools');

    const stakingNFTSupplyBefore = await this.stakingNFT.totalSupply();

    // Migrates stakers
    for (const staker of selectedStakers) {
      await this.pooledStaking.migrateToNewV2Pool(staker);
    }

    // Get stakers NXM balances after the migration
    const nxmBalancesAfter = {};
    await Promise.all(
      selectedStakers.map(async staker => {
        nxmBalancesAfter[staker] = await this.nxm.balanceOf(staker);
      }),
    );

    // Check all new staking pools have been created
    console.log('Checking all new staking pools have been created');
    const stakingPoolCount = await this.stakingPoolFactory.stakingPoolCount();
    expect(stakingPoolCount).to.be.equal(selectedStakers.length + 1); // +1 because Armor has 2 pools

    // Check the new staking pools have the correct deposits and stakers have the correct balances
    console.log('Checking the new staking pools have the correct deposits and stakers have the correct balances');
    const depositsInStakingPools = {};
    for (let i = INITIAL_POOL_ID; i <= stakingPoolCount; i++) {
      const { deposits } = await this.tokenController.stakingPoolNXMBalances(i);
      console.log(`Staking pool ${i} deposit: ${deposits.toString()}`);
      depositsInStakingPools[i] = deposits;
    }

    // What ratio of the original staker's deposit was allocated to this pool.
    const poolDepositRatio = {};

    // Check Armor
    // 5% of the stake is unlocked
    // 71.25% of the stake moves to AAA Pool (95% * 75% of the stake)
    // 23.75% of the stake moves to AA Pool (95% * 25% os the stake)

    // Nexus Mutual Foundation Pool
    console.log('Nexus Mutual Foundation Pool');
    let expectedPoolId = INITIAL_POOL_ID;
    const foundationPoolId = expectedPoolId++;
    poolDepositRatio[foundationPoolId] = 100;
    // The entire NXM balance is unlocked and sent back to the Foundation
    // TODO: Needs some Solidity changes to be able to fully migrate them as well
    expect(depositsInStakingPools[foundationPoolId]).to.be.equal(0); // depositInPS[FOUNDATION]
    expect(nxmBalancesAfter[FOUNDATION]).to.be.equal(nxmBalancesBefore[FOUNDATION].add(depositInPS[FOUNDATION]));

    // Hugh Pool
    console.log('Hugh Pool');
    const hughPoolId = expectedPoolId++;
    poolDepositRatio[hughPoolId] = 100;
    expect(depositsInStakingPools[hughPoolId]).to.be.equal(depositInPS[HUGH]);
    // No NXM gets unlocked, so the balance shouldn't change
    expect(nxmBalancesAfter[HUGH]).to.be.equal(nxmBalancesBefore[HUGH]);

    // Needed because of the divisions we do on Armor's deposit to split it between the 2 pools
    let precisionTolerance = 2;

    // Armor AAA Pool
    console.log('Armor AAA Pool');
    const armorAAAPoolId = expectedPoolId++;
    poolDepositRatio[armorAAAPoolId] = 75;
    // 5% of the AAA allocation must be unlocked
    const expectedArmorAAAPoolBalance = depositInPS[ARMOR_STAKER].mul(poolDepositRatio[armorAAAPoolId])
      .div(100)
      .mul(95)
      .div(100);
    expect(depositsInStakingPools[armorAAAPoolId]).to.be.equal(expectedArmorAAAPoolBalance.sub(precisionTolerance));

    // Armor AA Pool
    console.log('Armor AA Pool');
    const armorAAPoolId = expectedPoolId++;
    poolDepositRatio[armorAAPoolId] = 25;
    // 5% of the AA allocation must be unlocked
    const expectedArmorAAPoolBalance = depositInPS[ARMOR_STAKER].mul(poolDepositRatio[armorAAPoolId])
      .div(100)
      .mul(95)
      .div(100);
    expect(depositsInStakingPools[armorAAPoolId]).to.be.equal(expectedArmorAAPoolBalance.sub(precisionTolerance));

    // Overall we must unlock 5% of Armor's total tokens in PS
    precisionTolerance = 6;
    expect(nxmBalancesAfter[ARMOR_STAKER]).to.be.equal(
      nxmBalancesBefore[ARMOR_STAKER].add(depositInPS[ARMOR_STAKER].mul(5).div(100)).add(precisionTolerance),
    );

    // Check PS deposits are now 0 for all selected stakers
    console.log('Checking PS deposits are now 0 for all selected stakers');
    await Promise.all(
      selectedStakers.map(async staker => {
        const deposit = await this.pooledStaking.stakerDeposit(staker);
        expect(deposit).to.be.equal(0);
      }),
    );

    // Check price and weight for staked products in the newly created staking pools
    console.log('Checking price and weight for staked products in the newly created staking pools');

    const PRODUCT_ADDRESSES_OUTPUT = require(PRODUCT_ADDRESSES_OUTPUT_PATH);
    const productAddresses = PRODUCT_ADDRESSES_OUTPUT.map(address => address.toLowerCase());
    const stakers = selectedStakers.concat([ARMOR_STAKER]); // Armor has 2 pools - do this so we can iterate below

    const deprecatedProducts = new Set();
    const productsWithNoStake = new Set();

    for (let poolId = INITIAL_POOL_ID; poolId <= stakingPoolCount; poolId++) {
      const stakerAddress = stakers[poolId - 1];
      console.log('Checking prices for staking pool', poolId, 'of', stakerAddress);

      const addressesOfProductsStakedInPS = await this.pooledStaking.stakerContractsArray(stakerAddress);
      const idsOfProductsStakedInPS = addressesOfProductsStakedInPS.map(c => productAddresses.indexOf(c.toLowerCase()));

      for (let j = 0; j < idsOfProductsStakedInPS.length; j++) {
        const productId = idsOfProductsStakedInPS[j];
        const productAddress = addressesOfProductsStakedInPS[j];

        // Product is deprecated and sunset (we didn't migrate it)
        if (productId === -1) {
          deprecatedProducts.add(productAddress);
          continue;
        }

        const productPrice = await this.pooledStaking.getV1PriceForProduct(productId);

        // Product is deprecated and not sunset (we migrated it as covers can still be claimed, but the quote engine
        // can't give us a price for it)
        if (productPrice.toString() === MaxUint96.toString()) {
          deprecatedProducts.add(productAddress);
          continue;
        }

        // Product has no stake in PS
        const stakeForProductInPS = stakesInPSBefore[stakerAddress][productAddress];
        if (stakeForProductInPS.isZero()) {
          productsWithNoStake.add(productAddress);
          continue;
        }

        // Check price
        const stakedProduct = await this.stakingProducts.getProduct(poolId, productId);
        expect(stakedProduct.targetPrice).to.be.equal(productPrice.div(BigNumber.from((1e16).toString())));
        expect(stakedProduct.bumpedPrice).to.be.equal(productPrice.div(BigNumber.from((1e16).toString())));

        // Check weight
        // Expected to be a number between 0-100, calculated as (product-stake-in-PS / deposit-in-PS)
        const expectedWeight = stakeForProductInPS
          .mul(parseEther('1'))
          .div(depositInPS[stakerAddress])
          .div(parseEther('0.01'));
        expect(stakedProduct.targetWeight).to.be.equal(expectedWeight);
        expect(stakedProduct.lastEffectiveWeight).to.be.equal(BigNumber.from(0));
      }
    }
    console.log({ deprecatedProducts, productsWithNoStake });

    // Only managers of pools with non-zero deposits own a StakingNFT
    const poolsWithDepositsCount = Object.values(depositsInStakingPools).filter(deposit => deposit.gt(0)).length;
    console.log(`Check that ${poolsWithDepositsCount} StakingNFTs are minted`);
    const stakingNFTSupplyAfter = await this.stakingNFT.totalSupply();
    expect(stakingNFTSupplyAfter.sub(stakingNFTSupplyBefore)).to.be.equal(poolsWithDepositsCount);

    // Check pool configurations are set correctly for each pool
    console.log('Checking pool configurations are set correctly for each pool');

    const expectedPoolConfigurations = {};
    expectedPoolConfigurations[foundationPoolId] = {
      maxFee: 99,
      initialFee: 0,
      manager: FOUNDATION,
      isPrivatePool: true,
      // stakingNFTId: stakingNFTSupplyBefore.add(1),
      trancheStakeRatio: [0, 0, 0, 0, 0, 0, 0, 0],
    };
    expectedPoolConfigurations[hughPoolId] = {
      maxFee: 20,
      initialFee: 10,
      manager: HUGH,
      isPrivatePool: false,
      stakingNFTId: stakingNFTSupplyBefore.add(1),
      trancheStakeRatio: [0, 10, 0, 0, 0, 90, 0, 0],
    };
    expectedPoolConfigurations[armorAAAPoolId] = {
      maxFee: 25,
      initialFee: 15,
      manager: ARMOR_MANAGER,
      isPrivatePool: false,
      stakingNFTId: stakingNFTSupplyBefore.add(2),
      trancheStakeRatio: [20, 25, 25, 15, 10, 0, 0, 0],
    };
    expectedPoolConfigurations[armorAAPoolId] = {
      maxFee: 25,
      initialFee: 15,
      manager: ARMOR_MANAGER,
      isPrivatePool: false,
      stakingNFTId: stakingNFTSupplyBefore.add(3),
      trancheStakeRatio: [20, 25, 25, 15, 10, 0, 0, 0],
    };

    for (let poolId = INITIAL_POOL_ID; poolId <= stakingPoolCount; poolId++) {
      const stakerAddress = stakers[poolId - 1];
      console.log(`Checking pool configuration for staking pool ${poolId} of ${stakerAddress}`);

      const stakingPool = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(poolId));
      const isPrivatePool = await stakingPool.isPrivatePool();
      const poolFee = await stakingPool.getPoolFee();
      const maxFee = await stakingPool.getMaxPoolFee();
      const manager = await stakingPool.manager();

      const expected = expectedPoolConfigurations[poolId];
      expect(maxFee).to.be.equal(expected.maxFee);
      expect(poolFee).to.be.equal(expected.initialFee);
      expect(manager.toLowerCase()).to.be.equal(expected.manager.toLowerCase());
      expect(isPrivatePool).to.be.equal(expected.isPrivatePool);

      // Check the expected stakingNFTId for each manager.
      // Assumes exactly one StakingNFT per pool is minted that has a non-zero deposit.
      if (depositsInStakingPools[poolId].gt(0)) {
        const ownerOfStakingNFT = await this.stakingNFT.ownerOf(expected.stakingNFTId);
        expect(ownerOfStakingNFT.toLowerCase()).to.be.equal(expected.manager.toLowerCase());
      } else {
        console.log(`Staker ${stakerAddress}'s manager ${expected.manager} does not own a StakingNFT.`);
      }

      // Check NXM is staked correctly across tranches
      const totalAllocations = expected.trancheStakeRatio.reduce((a, b) => a + b, 0);
      if (totalAllocations === 0) {
        // Nexus Foundation is still in this situation
        console.log(`Skip allocation verifications for ${stakerAddress}. There are none expected to be made`);
        continue;
      }

      const block = await ethers.provider.getBlock('latest');
      const firstTrancheId = BigNumber.from(block.timestamp).div(91 * 24 * 3600);
      const token = await this.stakingViewer.getToken(expected.stakingNFTId);

      // Precision error from divisions
      expect(depositsInStakingPools[poolId].sub(token.activeStake).lt(4));

      // StakingViewer returns non-zero deposits only
      const tokenDepositsLength = token.deposits.length;
      expect(tokenDepositsLength).to.be.equal(expected.trancheStakeRatio.filter(r => r > 0).length);

      let depositStakeSum = BigNumber.from(0);
      let stakeSharesSum = BigNumber.from(0);
      const sharesSupply = await stakingPool.getStakeSharesSupply();

      for (let i = 0; i < tokenDepositsLength; i++) {
        const deposit = token.deposits[i];
        const trancheId = deposit.trancheId;
        // console.log('Deposit trancheId --------------------', trancheId.toString());

        // Index of the active tranche
        const activeTrancheIndex = trancheId.sub(firstTrancheId);
        // console.log('ActiveTrancheIndex', activeTrancheIndex.toString());

        // Calculated out of the original pooled staking deposit
        const expectedStake = depositInPS[stakerAddress]
          .mul(poolDepositRatio[poolId])
          .div(100)
          .mul(expected.trancheStakeRatio[activeTrancheIndex])
          .div(100);

        // console.log('Expected tranche stake', expectedStake.toString());
        // console.log('Actual tranche stake', deposit.stake.toString());

        const stakeDiffAbs = Math.abs(deposit.stake.sub(expectedStake));
        expect(stakeDiffAbs).to.be.lt(100000000000); // 0.00001%

        stakeSharesSum = stakeSharesSum.add(deposit.stakeShares);
        depositStakeSum = depositStakeSum.add(deposit.stake);
      }

      expect(depositStakeSum).to.be.equal(token.activeStake);
      expect(stakeSharesSum).to.be.equal(sharesSupply);
      // console.log('-------------- deposit in PS = ', depositInPS[stakerAddress].toString());
    }

    this.armorAAAPoolId = armorAAAPoolId;
    this.armorAAPoolId = armorAAPoolId;
    this.foundationPoolId = foundationPoolId;
    this.hughPoolId = hughPoolId;
  });

  it('Non-selected stakers can withdraw their entire deposit from LegacyPooledStaking', async function () {
    const arbitraryStakers = [
      '0x7a17d7661ed48322A03ab16Cd7CCa97aa28C2e99',
      '0x50c4E8fd53D5F8686ff35C54e3AA4B2c6241a5bF',
    ];

    for (const stakerAddress of arbitraryStakers) {
      // Unlock and fund staker address
      const staker = await getSigner(stakerAddress);
      await evm.impersonate(stakerAddress);
      await evm.setBalance(stakerAddress, parseEther('1000'));

      const nxmBalanceBefore = await this.nxm.balanceOf(stakerAddress);
      const stakerDepositBefore = await this.pooledStaking.stakerDeposit(stakerAddress);

      // Check staker has a deposit
      expect(stakerDepositBefore).to.be.greaterThan('0');
      await this.pooledStaking.connect(staker).withdraw('0'); // parameter is unused

      const nxmBalanceAfter = await this.nxm.balanceOf(stakerAddress);
      const stakerDepositAfter = await this.pooledStaking.stakerDeposit(stakerAddress);

      expect(stakerDepositAfter).to.be.equal('0');
      expect(nxmBalanceAfter.sub(nxmBalanceBefore)).to.be.equal(stakerDepositBefore);
    }
  });

  // TODO review
  it('purchase Cover at the expected prices from the migrated pools', async function () {
    const coverBuyer = this.abMembers[4];
    const poolEthBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    const UNISWAP_V3 = '0x1F98431c8aD98523631AE4a59f267346ea31F984';

    const productId = await this.productsV1.getNewProductId(UNISWAP_V3);

    const migratedPrice = await this.pooledStaking.getV1PriceForProduct(productId);

    const coverAsset = 0; // ETH
    const amount = parseEther('1');

    const MAX_COVER_PERIOD_IN_DAYS = 364;
    const DAYS_IN_YEAR = 365;
    const period = MAX_COVER_PERIOD_IN_DAYS * 24 * 3600;
    const expectedPremium = amount
      .mul(migratedPrice)
      .div((1e18).toString())
      .div(100)
      // annualized premium is for DAYS_IN_YEAR but covers can only be up to MAX_COVER_PERIOD_IN_DAYS long
      .mul(MAX_COVER_PERIOD_IN_DAYS)
      .div(DAYS_IN_YEAR);
    const paymentAsset = coverAsset;

    const poolAllocationRequest = [{ poolId: this.armorAAAPoolId, coverAmountInAsset: amount }];

    console.log(`Buyer ${coverBuyer._address} buying cover for ${productId.toString()} on Pool ${this.armorAAAPoolId}`);

    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: '0', // new cover
        owner: coverBuyer._address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremium },
    );

    const poolEthBalanceAfter = await ethers.provider.getBalance(this.pool.address);

    const premiumSentToPool = poolEthBalanceAfter.sub(poolEthBalanceBefore);

    console.log({
      premiumSentToPool: premiumSentToPool.toString(),
      expectedPremium: expectedPremium.toString(),
      migratedPrice: migratedPrice.toString(),
    });

    expect(expectedPremium).to.be.greaterThanOrEqual(premiumSentToPool);

    // expectedPremium >= premiumSentToPool guaranteed by the assertion above.
    // We then assert the difference between the 2 is less than 0.01% of the original amount
    // The difference comes from the fact that we truncate prices to 4 decimals when we port them from
    // Quote Engine to StakingProduct.sol. On top of that, the covers go only up to 364 days, while the
    // Quote Engine prices are calculated for 365.25 days.
    // The latter is partially accounted for in the expectedPremium computation above
    // (BigNumber doesn't support fractions)
    expect(expectedPremium.sub(premiumSentToPool)).to.be.lessThanOrEqual(amount.div(10000));
  });

  it('Remove CR, CD, IC, QD, QT, TF, TD, P2', async function () {
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.removeContracts, // removeContracts(bytes2[])
      defaultAbiCoder.encode(['bytes2[]'], [['CR', 'CD', 'IC', 'QD', 'QT', 'TF', 'TD', 'P2'].map(x => toUtf8Bytes(x))]),
      this.abMembers,
      this.governance,
    );
  });

  it('Deploy & add contracts: Assessment, IndividualClaims, YieldTokenIncidents', async function () {
    const individualClaims = await ethers.deployContract('IndividualClaims', [this.nxm.address, this.coverNFT.address]);
    const yieldTokenIncidents = await ethers.deployContract('YieldTokenIncidents', [
      this.nxm.address,
      this.coverNFT.address,
    ]);
    const assessment = await ethers.deployContract('Assessment', [this.nxm.address]);

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

  it('Deploy CoverViewer', async function () {
    await ethers.deployContract('CoverViewer', [this.master.address]);
  });

  it('MemberRoles is initialized with kycAuthAddress from QuotationData', async function () {
    const kycAuthAddressQD = await this.quotationData.kycAuthAddress();
    const kycAuthAddressMR = await this.memberRoles.kycAuthAddress();
    expect(kycAuthAddressMR).to.be.equal(kycAuthAddressQD);
  });
});
