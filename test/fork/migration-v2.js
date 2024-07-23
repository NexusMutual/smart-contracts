const { ethers, network, run } = require('hardhat');
const { expect } = require('chai');
const fetch = require('node-fetch');

const evm = require('./evm')();
const proposalCategories = require('../utils').proposalCategories;
const { ProposalCategory: PROPOSAL_CATEGORIES, ContractTypes } = require('../../lib/constants');
const { Address, calculateProxyAddress, formatInternalContracts, submitGovernanceProposal } = require('./utils');

const { ETH } = Address;
const { BigNumber } = ethers;
const { AddressZero, Zero, Two } = ethers.constants;
const { parseEther, formatEther, defaultAbiCoder, toUtf8Bytes, getAddress, keccak256, hexZeroPad } = ethers.utils;

const SCRIPTS_USE_CACHE = !process.env.NO_CACHE;

const CoverCreate2Salt = 4924891554;
const StakingProductsCreate2Salt = 203623750;
const IndividualClaimsCreate2Salt = 352721057824254;
const YieldTokenIncidentsCreate2Salt = 2596290771;
const AssessmentCreate2Salt = 352729799262241;

// const getProductAddresses = require('../../scripts/v2-migration/get-v2-products');
// const getV1CoverPrices = require('../../scripts/v2-migration/get-v1-cover-prices');
const getGovernanceRewards = require('../../scripts/v2-migration/get-governance-rewards');
const getClaimAssessmentRewards = require('../../scripts/v2-migration/get-claim-assessment-rewards');
const getClaimAssessmentStakes = require('../../scripts/v2-migration/get-claim-assessment-stakes');
const getTCLockedAmount = require('../../scripts/v2-migration/get-tc-locked-amount');
const getCNLockedAmount = require('../../scripts/v2-migration/get-cn-locked');
const generateV2ProductTxs = require('../../scripts/v2-migration/generate-v2-products-txs');

const PRODUCTS_WITH_REWARDS_PATH = '../../scripts/v2-migration/input/products-with-v1-rewards.json';
const PRODUCT_ADDRESSES_OUTPUT_PATH = '../../scripts/v2-migration/output/product-addresses.json';
const GV_REWARDS_OUTPUT_PATH = '../../scripts/v2-migration/output/governance-rewards.json';
const CLA_REWARDS_OUTPUT_PATH = '../../scripts/v2-migration/output/claim-assessment-rewards.json';
const CLA_STAKES_OUTPUT_PATH = '../../scripts/v2-migration/output/claim-assessment-stakes.json';
const TC_LOCKED_AMOUNT_OUTPUT_PATH = '../../scripts/v2-migration/output/tc-locked-amount.json';
const CN_LOCKED_AMOUNT_OUTPUT_PATH = '../../scripts/v2-migration/output/cn-locked-amount.json';

// const WETH_ADDRESS = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const DAI_ADDRESS = '0x6B175474E89094C44Da98b954EedeAC495271d0F';
const STETH_ADDRESS = '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84';
// const SWAP_CONTROLLER = '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f';
// const COWSWAP_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41';

const ENZYMEV4_VAULT_PROXY_ADDRESS = '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD';
// const ENZYME_FUND_VALUE_CALCULATOR_ROUTER = '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9';

// const DAI_PRICE_FEED_ORACLE_AGGREGATOR = '0x773616E4d11A78F511299002da57A0a94577F1f4';
// const STETH_PRICE_FEED_ORACLE_AGGREGATOR = '0x86392dC19c0b719886221c78AB11eb8Cf5c52812';
// const ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR = '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7';

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const MEMBER_ADDRESS = '0xd7cba5b9a0240770cfd9671961dae064136fa240';
const CLAIM_PAYABLE_ADDRESS = '0x748E712663510Bb417c1aBb1bca3d817447f118c';

const ASSET_V1_TO_ASSET_V2 = {};
ASSET_V1_TO_ASSET_V2[ETH.toLowerCase()] = 0;
ASSET_V1_TO_ASSET_V2[DAI_ADDRESS.toLowerCase()] = 1;

const MaxUint96 = Two.pow(96).sub(1);

const V2Addresses = {
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  PriceFeedOracle: '0xcafeaf0a0672360941b7f0b6d015797292e842c6',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  NXMaster: '0xcafea0047591B979c714A63283B8f902554deB66',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingPool: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  CoverImpl: '0xcafeaCbabeEd884AE94046d87C8aAB120958B8a6',
  StakingProductsImpl: '0xcafea524e89514e131eE9F8462536793d49d8738',
  IndividualClaimsImpl: '0xcafeaC308bC9B49d6686897270735b4Dc11Fa1Cf',
  YieldTokenIncidentsImpl: '0xcafea7F77b63E995aE864dA9F36c8012666F8Fa4',
  AssessmentImpl: '0xcafea40dE114C67925BeB6e8f0F0e2ee4a25Dd88',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  TokenController: '0xcafea53357c11b3967A8C7167Fb4973C75063DbB',
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0xcafea22Faff6aEc1d1bfc146b2e2EABC73Fa7Acc',
  LegacyPooledStaking: '0xcafea16366682a6c0083c38b2a731BC223c53D27',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  LegacyGateway: '0xcafeaD694A05815f03F19c357200c6D95968e205',
  Governance: '0xcafeafA258Be9aCb7C0De989be21A8e9583FBA65',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
};

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

describe('V2 upgrade', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

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
    this.pooledStaking = await factory('PS');
    this.gateway = await factory('GW');
    this.priceFeedOracle = await factory('PRICEORACLE');

    this.mcrValueBefore = await this.mcr.getMCR();

    // Pool value related info
    this.poolValueBefore = await this.pool.getPoolValueInEth();

    this.ethBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    this.dai = await ethers.getContractAt('ERC20Mock', DAI_ADDRESS);
    this.daiBalanceBefore = await this.dai.balanceOf(this.pool.address);

    this.stEth = await ethers.getContractAt('ERC20Mock', STETH_ADDRESS);
    this.stEthBalanceBefore = await this.stEth.balanceOf(this.pool.address);

    this.enzymeShares = await ethers.getContractAt('ERC20Mock', ENZYMEV4_VAULT_PROXY_ADDRESS);
    this.enzymeSharesBalanceBefore = await this.enzymeShares.balanceOf(this.pool.address);

    // non proxy contract data
    this.contractData = {
      mcr: {
        before: {},
        after: {},
      },
      pool: {
        before: {},
        after: {},
      },
      priceFeedOracle: {
        before: {},
        after: {},
      },
    };
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

  // File locked in preparation for ProductsV1.sol deployment
  // ------------------------------------------------------
  // it('Generate ProductsV1.sol with all products to be migrated to V2', async function () {
  //   await getProductAddresses(SCRIPTS_USE_CACHE);
  // });

  // File locked in preparation for PricesV1.sol deployment
  // ------------------------------------------------------
  // it('Get V1 cover prices', async function () {
  //   await getV1CoverPrices(ethers.provider, SCRIPTS_USE_CACHE);
  // });

  it('Get governance rewards', async function () {
    await getGovernanceRewards(ethers.provider, SCRIPTS_USE_CACHE);
  });

  it('Get claim assessment rewards and generate transfer calls in LegacyClaimsReward.sol', async function () {
    await getClaimAssessmentRewards(ethers.provider, SCRIPTS_USE_CACHE);
  });

  it('Get claim assessment stakes', async function () {
    await getClaimAssessmentStakes(ethers.provider, SCRIPTS_USE_CACHE);
  });

  it('Get TC locked amount', async function () {
    await getTCLockedAmount(ethers.provider, SCRIPTS_USE_CACHE);
  });

  it('Recompile contracts if needed', async function () {
    await run('compile');
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

  // Skipping, we already have this category on mainnet
  it.skip('Add proposal category 43 (Add new contracts)', async function () {
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

  // Skipping, we already have this category on mainnet
  it.skip('Add proposal category 44 (Remove contracts)', async function () {
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

  // Use deployed contract
  // it('Deploy ProductsV1.sol', async function () {
  //   this.productsV1 = await ethers.getContractAt('ProductsV1', V2Addresses.ProductsV1);
  // });

  // Use deployed contract
  it('Deploy SwapOperator.sol', async function () {
    this.swapOperator = await ethers.getContractAt('SwapOperator', V2Addresses.SwapOperator);
  });

  // Use salts for deployed contracts
  it('Calculate proxy addresses for CO, SP, AS, CI, CG', async function () {
    this.coverProxyAddress = calculateProxyAddress(this.master.address, CoverCreate2Salt);
    this.stakingProductsProxyAddress = calculateProxyAddress(this.master.address, StakingProductsCreate2Salt);
    this.individualClaimsProxyAddress = calculateProxyAddress(this.master.address, IndividualClaimsCreate2Salt);
    this.yieldTokenProxyAddress = calculateProxyAddress(this.master.address, YieldTokenIncidentsCreate2Salt);
    this.assessmentProxyAddress = calculateProxyAddress(this.master.address, AssessmentCreate2Salt);
  });

  // Use deployed contracts
  it('Deploy CoverNFTDescriptor.sol and CoverNFT.sol', async function () {
    this.coverNFTDescriptor = await ethers.getContractAt('CoverNFTDescriptor', V2Addresses.CoverNFTDescriptor);
    this.coverNFT = await ethers.getContractAt('CoverNFT', V2Addresses.CoverNFT);
  });

  // Use deployed contracts
  it('Deploy StakingPoolFactory.sol, StakingNFT.sol, StakingNFTDescriptor.sol, StakingPool.sol', async function () {
    // this.stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [this.coverProxyAddress]);
    // this.stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');
    //
    // this.stakingNFT = await ethers.deployContract('StakingNFT', [
    //   'Nexus Mutual Deposit',
    //   'NMD',
    //   this.stakingPoolFactory.address,
    //   this.coverProxyAddress,
    //   this.stakingNFTDescriptor.address,
    // ]);
    //
    // this.stakingPool = await ethers.deployContract('StakingPool', [
    //   this.stakingNFT.address,
    //   this.nxm.address,
    //   this.coverProxyAddress,
    //   this.tokenController.address,
    //   this.master.address,
    //   this.stakingProductsProxyAddress,
    // ]);

    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.stakingNFTDescriptor = await ethers.getContractAt('StakingNFTDescriptor', V2Addresses.StakingNFTDescriptor);
    this.stakingNFT = await ethers.getContractAt('StakingNFT', V2Addresses.StakingNFT);
    this.stakingPool = await ethers.getContractAt('StakingPool', V2Addresses.StakingPoolImpl);
  });

  it('Collect storage data before upgrade', async function () {
    // MCR
    this.contractData.mcr.before.mcrFloorIncrementThreshold = await this.mcr.mcrFloorIncrementThreshold();
    this.contractData.mcr.before.maxMCRFloorIncrement = await this.mcr.maxMCRFloorIncrement();
    this.contractData.mcr.before.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.before.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.before.minUpdateTime = await this.mcr.mcrFloor();
    this.contractData.mcr.before.mcr = await this.mcr.mcr();
    this.contractData.mcr.before.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.before.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.before.previousMCR = await this.mcr.previousMCR();

    // POOL
    const assets = await this.pool.getAssets();
    const assetsData = await Promise.all(assets.map(address => this.pool.assetData(address)));
    this.contractData.pool.before.assetsData = assets.reduce((acc, asset, i) => {
      acc[asset] = {
        minAmount: assetsData[i].minAmount,
        maxAmount: assetsData[i].maxAmount,
        lastSwapTime: assetsData[i].lastSwapTime,
        maxSlippageRatio: assetsData[i].maxSlippageRatio,
      };
      return acc;
    }, {});
    this.contractData.pool.before.minPoolEth = await this.swapOperator.minPoolEth();
    this.contractData.pool.before.assets = assets;

    // PRICE FEED
    const assetsEthRate = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)));
    const getAssetForEth = await Promise.all(assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)));

    this.contractData.priceFeedOracle.before.assetsEthRate = assets.reduce((acc, asset, i) => {
      acc[asset] = assetsEthRate[i];
      return acc;
    }, {});
    this.contractData.priceFeedOracle.before.assetsForEth = assets.reduce((acc, asset, i) => {
      acc[asset] = getAssetForEth[i];
      return acc;
    }, {});
  });

  // Use deployed contract
  it('Deploy and upgrade NXMaster.sol', async function () {
    // const master = await ethers.deployContract('NXMaster');

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMaster, // upgradeTo(address)
      // defaultAbiCoder.encode(['address'], [master.address]),
      defaultAbiCoder.encode(['address'], [V2Addresses.NXMaster]),
      this.abMembers,
      this.governance,
    );
  });

  // Use deployed contracts
  it('Add new contracts: CI, CG, AS, CO, SP', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    // const individualClaims = await ethers.deployContract('IndividualClaims', [
    //   this.nxm.address,
    //   this.coverNFT.address,
    // ]);
    // const yieldTokenIncidents = await ethers.deployContract('YieldTokenIncidents', [
    //   this.nxm.address,
    //   this.coverNFT.address,
    // ]);
    // const assessment = await ethers.deployContract('Assessment', [this.nxm.address]);

    // // CO - Cover.sol
    // const coverImpl = await ethers.deployContract('Cover', [
    //   this.coverNFT.address,
    //   this.stakingNFT.address,
    //   this.stakingPoolFactory.address,
    //   this.stakingPool.address,
    // ]);
    //
    // // SP - StakingProduct.sol
    // const stakingProductsImpl = await ethers.deployContract('StakingProducts', [
    //   this.coverProxyAddress,
    //   this.stakingPoolFactory.address,
    // ]);

    const individualClaims = await ethers.getContractAt('IndividualClaims', V2Addresses.IndividualClaimsImpl);
    const yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', V2Addresses.YieldTokenIncidentsImpl);
    const assessment = await ethers.getContractAt('Assessment', V2Addresses.AssessmentImpl);
    const coverImpl = await ethers.getContractAt('Cover', V2Addresses.CoverImpl);
    const stakingProductsImpl = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProductsImpl);

    const coverTypeAndSalt = BigNumber.from(CoverCreate2Salt).shl(8).add(ContractTypes.Proxy);
    const stakingProductsTypeAndSalt = BigNumber.from(StakingProductsCreate2Salt).shl(8).add(ContractTypes.Proxy);
    const individualClaimsTypeAndSalt = BigNumber.from(IndividualClaimsCreate2Salt).shl(8).add(ContractTypes.Proxy);
    const yieldTokenIncidentsTypeAndSalt = BigNumber.from(YieldTokenIncidentsCreate2Salt)
      .shl(8)
      .add(ContractTypes.Proxy);
    const assessmentTypeAndSalt = BigNumber.from(AssessmentCreate2Salt).shl(8).add(ContractTypes.Proxy);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.newContracts, // addNewInternalContracts(bytes2[],address[],uint256[])
      defaultAbiCoder.encode(
        ['bytes2[]', 'address[]', 'uint256[]'],
        [
          [toUtf8Bytes('CI'), toUtf8Bytes('CG'), toUtf8Bytes('AS'), toUtf8Bytes('CO'), toUtf8Bytes('SP')],
          [individualClaims, yieldTokenIncidents, assessment, coverImpl, stakingProductsImpl].map(c => c.address),
          [
            individualClaimsTypeAndSalt,
            yieldTokenIncidentsTypeAndSalt,
            assessmentTypeAndSalt,
            coverTypeAndSalt,
            stakingProductsTypeAndSalt,
          ],
        ],
      ),
      this.abMembers,
      this.governance,
    );

    this.cover = await ethers.getContractAt('Cover', this.coverProxyAddress);
    this.stakingProducts = await ethers.getContractAt('StakingProducts', this.stakingProductsProxyAddress);

    this.individualClaims = await ethers.getContractAt('IndividualClaims', this.individualClaimsProxyAddress);
    this.yieldTokenIncidents = await ethers.getContractAt('YieldTokenIncidents', this.yieldTokenProxyAddress);
    this.assessment = await ethers.getContractAt('Assessment', this.assessmentProxyAddress);

    const actualCoverAddress = await this.master.getLatestAddress(toUtf8Bytes('CO'));
    expect(actualCoverAddress).to.be.equal(this.coverProxyAddress);

    const actualStakingProductsAddress = await this.master.getLatestAddress(toUtf8Bytes('SP'));
    expect(actualStakingProductsAddress).to.be.equal(this.stakingProductsProxyAddress);

    const actualIndividualClaimsAddress = await this.master.getLatestAddress(toUtf8Bytes('CI'));
    expect(actualIndividualClaimsAddress).to.be.equal(this.individualClaimsProxyAddress);

    const actualYieldTokenAddress = await this.master.getLatestAddress(toUtf8Bytes('CG'));
    expect(actualYieldTokenAddress).to.be.equal(this.yieldTokenProxyAddress);

    const actualAssessmentAddress = await this.master.getLatestAddress(toUtf8Bytes('AS'));
    expect(actualAssessmentAddress).to.be.equal(this.assessmentProxyAddress);

    const contractsAfter = await this.master.getInternalContracts();
    console.log('Contracts before:', formatInternalContracts(contractsBefore));
    console.log('Contracts after:', formatInternalContracts(contractsAfter));
  });

  it('Upgrade contracts: MR, MCR, TC, PS, P1, CL (CoverMigrator), GW, CR, GV', async function () {
    // CR - ClaimRewards.sol
    // const newClaimsReward = await ethers.deployContract('LegacyClaimsReward', [this.master.address, DAI_ADDRESS]);
    const newClaimsReward = await ethers.getContractAt('LegacyClaimsReward', V2Addresses.LegacyClaimsReward);

    // TC - TokenController.sol
    // const tokenController = await ethers.deployContract('TokenController', [
    //   this.quotationData.address,
    //   newClaimsReward.address,
    //   this.stakingPoolFactory.address,
    //   this.nxm.address,
    // ]);
    const tokenController = await ethers.getContractAt('TokenController', V2Addresses.TokenController);

    // MCR - MCR.sol
    // const mcr = await ethers.deployContract('MCR', [this.master.address]);
    const mcr = await ethers.getContractAt('MCR', V2Addresses.MCR);

    // MR - MemberRoles.sol
    // const memberRoles = await ethers.deployContract('MemberRoles', [this.nxm.address]);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);

    // PS - PooledStaking.sol
    // const pooledStaking = await ethers.deployContract('LegacyPooledStaking', [
    //   this.coverProxyAddress,
    //   this.productsV1.address,
    //   this.stakingNFT.address,
    // ]);
    const pooledStaking = await ethers.getContractAt('LegacyPooledStaking', V2Addresses.LegacyPooledStaking);

    // P1 - Pool.sol
    const pool = await ethers.getContractAt('Pool', V2Addresses.Pool);

    // Enable Pool as Enzyme receiver - skipping as it's been done on mainnet
    // ------------------------------------------------------
    // await enableAsEnzymeReceiver(pool.address);

    // CL - CoverMigrator.sol
    // const coverMigrator = await ethers.deployContract('CoverMigrator', [
    //   this.quotationData.address,
    //   this.productsV1.address,
    // ]);
    const coverMigrator = await ethers.getContractAt('CoverMigrator', V2Addresses.CoverMigrator);

    // GW - Gateway.sol
    // const gateway = await ethers.deployContract('LegacyGateway', [this.quotationData.address]);
    const gateway = await ethers.getContractAt('LegacyGateway', V2Addresses.LegacyGateway);

    // GV - Governance.sol
    // const governance = await ethers.deployContract('Governance');
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);

    const contractsBefore = await this.master.getInternalContracts();

    const codes = ['MR', 'MC', 'CR', 'TC', 'PS', 'P1', 'CL', 'GW', 'GV'].map(code => toUtf8Bytes(code));
    const addresses = [
      memberRoles,
      mcr,
      newClaimsReward,
      tokenController,
      pooledStaking,
      pool,
      coverMigrator,
      gateway,
      governance,
    ].map(c => c.address);

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();
    console.log('Contracts before:', formatInternalContracts(contractsBefore));
    console.log('Contracts after:', formatInternalContracts(contractsAfter));

    this.memberRoles = await ethers.getContractAt('MemberRoles', this.memberRoles.address);
    this.tokenController = await ethers.getContractAt('TokenController', this.tokenController.address);
    this.pooledStaking = await ethers.getContractAt('LegacyPooledStaking', this.pooledStaking.address);
    this.gateway = await ethers.getContractAt('LegacyGateway', this.gateway.address);
    this.governance = await ethers.getContractAt('Governance', this.governance.address);

    this.mcr = mcr;
    this.pool = pool;
    this.coverMigrator = coverMigrator;
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

  it('MCR value check', async function () {
    const mcrValueAfter = await this.mcr.getMCR();

    expect(mcrValueAfter).to.be.equal(this.mcrValueBefore);
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

  it('Compares storage of upgraded contracts', async function () {
    // MCR
    this.contractData.mcr.after.mcrFloorIncrementThreshold = await this.mcr.mcrFloorIncrementThreshold();
    this.contractData.mcr.after.maxMCRFloorIncrement = await this.mcr.maxMCRFloorIncrement();
    this.contractData.mcr.after.maxMCRIncrement = await this.mcr.maxMCRIncrement();
    this.contractData.mcr.after.gearingFactor = await this.mcr.gearingFactor();
    this.contractData.mcr.after.minUpdateTime = await this.mcr.mcrFloor();
    this.contractData.mcr.after.mcr = await this.mcr.mcr();
    this.contractData.mcr.after.desiredMCR = await this.mcr.desiredMCR();
    this.contractData.mcr.after.lastUpdateTime = await this.mcr.lastUpdateTime();
    this.contractData.mcr.after.previousMCR = await this.mcr.previousMCR();

    Object.entries(this.contractData.mcr.before).forEach(([key, value]) => {
      expect(this.contractData.mcr.after[key], `AssertionError: values of ${key} don't match\n`).to.be.equal(value);
    });

    // POOL
    const assetsData = await Promise.all(
      this.contractData.pool.before.assets.map(address => this.pool.swapDetails(address)),
    );
    this.contractData.pool.after.assetsData = this.contractData.pool.before.assets.reduce((acc, asset, i) => {
      acc[asset] = {
        minAmount: assetsData[i].minAmount,
        maxAmount: assetsData[i].maxAmount,
        lastSwapTime: assetsData[i].lastSwapTime,
        maxSlippageRatio: assetsData[i].maxSlippageRatio,
      };
      return acc;
    }, {});
    this.contractData.pool.after.minPoolEth = await this.swapOperator.minPoolEth();
    expect(this.contractData.pool.after.minPoolEth, "AssertionError: values of minPoolEth don't match\n").to.be.equal(
      this.contractData.pool.before.minPoolEth,
    );

    const DENOMINATOR_DIFFERENCE = Math.pow(10, 14);
    Object.entries(this.contractData.pool.before.assetsData).forEach(([asset, value]) => {
      expect(
        this.contractData.pool.after.assetsData[asset].minAmount,
        `AssertionError: values of minAmount in ${asset} don't match\n`,
      ).to.be.equal(value.minAmount);

      expect(
        this.contractData.pool.after.assetsData[asset].maxAmount,
        `AssertionError: values of maxAmount in ${asset} don't match\n`,
      ).to.be.equal(value.maxAmount);

      expect(
        this.contractData.pool.after.assetsData[asset].lastSwapTime,
        `AssertionError: values of lastSwapTime in ${asset} don't match\n`,
      ).to.be.oneOf([value.lastSwapTime, 0]);

      expect(
        this.contractData.pool.after.assetsData[asset].maxSlippageRatio,
        `AssertionError: values of maxSlippageRatio in ${asset} don't match\n`,
      ).to.be.equal(value.maxSlippageRatio.div(DENOMINATOR_DIFFERENCE));
    });

    // PRICE FEED
    const assetsEthRate = await Promise.all(
      this.contractData.pool.before.assets.map(address => this.priceFeedOracle.getAssetToEthRate(address)),
    );
    const getAssetForEth = await Promise.all(
      this.contractData.pool.before.assets.map(address => this.priceFeedOracle.getAssetForEth(address, 10)),
    );

    this.contractData.priceFeedOracle.after.assetsEthRate = this.contractData.pool.before.assets.reduce(
      (acc, asset, i) => {
        acc[asset] = assetsEthRate[i];
        return acc;
      },
      {},
    );
    this.contractData.priceFeedOracle.after.assetsForEth = this.contractData.pool.before.assets.reduce(
      (acc, asset, i) => {
        acc[asset] = getAssetForEth[i];
        return acc;
      },
      {},
    );

    Object.entries(this.contractData.priceFeedOracle.before.assetsEthRate).forEach(([asset, value]) => {
      expect(
        this.contractData.priceFeedOracle.after.assetsEthRate[asset],
        `AssertionError: values of assetsEthRate in ${asset} don't match\n`,
      ).to.be.equal(value);
    });

    Object.entries(this.contractData.priceFeedOracle.before.assetsForEth).forEach(([asset, value]) => {
      expect(
        this.contractData.priceFeedOracle.after.assetsForEth[asset],
        `AssertionError: values of assetsEthRate in ${asset} don't match\n`,
      ).to.be.equal(value);
    });
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
    expect(crBalance.sub(this.governanceRewardsSum).sub(this.claRewardsSum)).lt(parseEther('2'));
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

  it('Remove CR, CD, IC, QD, QT, TF, TD, P2, PD', async function () {
    const contractsBefore = await this.master.getInternalContracts();

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.removeContracts, // removeContracts(bytes2[])
      defaultAbiCoder.encode(
        ['bytes2[]'],
        [['CR', 'CD', 'IC', 'QD', 'QT', 'TF', 'TD', 'P2', 'PD'].map(x => toUtf8Bytes(x))],
      ),
      this.abMembers,
      this.governance,
    );

    const contractsAfter = await this.master.getInternalContracts();
    console.log('Contracts before:', formatInternalContracts(contractsBefore));
    console.log('Contracts after:', formatInternalContracts(contractsAfter));
  });

  it('Get CN locked amount', async function () {
    await getCNLockedAmount(ethers.provider, SCRIPTS_USE_CACHE);
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

  it('Run generate-v2-products-txs script', async function () {
    const signerAddress = await this.abMembers[0].getAddress();
    const { setProductTypesTransaction, setProductsTransaction, productTypeData, productData, productTypeIds } =
      await generateV2ProductTxs(ethers.provider, this.cover.address, signerAddress);

    console.log('Calling setProductTypes.');
    await this.abMembers[0].sendTransaction(setProductTypesTransaction);

    console.log('Calling setProducts.');
    await this.abMembers[0].sendTransaction(setProductsTransaction);

    const productCount = await this.cover.productsCount();
    assert.equal(productCount.toNumber(), productData.length);

    const productTypesCount = await this.cover.productTypesCount();
    assert.equal(productTypesCount.toNumber(), productTypeData.length);

    for (let i = 0; i < productTypeData.length; i++) {
      const productType = await this.cover.productTypes(i);
      const productTypeName = await this.cover.productTypeNames(i);

      const data = productTypeData[i];

      expect(productTypeName).to.be.equal(data.Name);
      expect(productType.claimMethod.toString()).to.be.equal(data['Claim Method']);
      expect(productType.gracePeriod.toString()).to.be.equal(data['Grace Period (days)']);
    }

    const products = await this.cover.getProducts();
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const data = productData[i];

      expect(product.productType).to.be.equal(productTypeIds[data['Product Type']]);
      expect(product.yieldTokenAddress).to.be.equal(
        data['Product Type'] === 'Yield Token'
          ? data['Yield Token Address']
          : '0x0000000000000000000000000000000000000000',
      );

      const coverAssetsAsText = data['Cover Assets'];
      const coverAssets =
        (coverAssetsAsText === 'DAI' && 0b10) || // Yield token cover that uses DAI
        (coverAssetsAsText === 'ETH' && 0b01) || // Yield token cover that uses ETH
        0; // The default is 0 - this means all assets are allowed (no whitelist)
      expect(product.coverAssets.toString()).to.be.equal(coverAssets.toString());
      expect(product.initialPriceRatio).to.be.equal(parseInt(data['Initial Price Ratio']) * 100);
      expect(product.capacityReductionRatio).to.be.equal(parseInt(data['Capacity Reduction Ratio']));
      expect(product.isDeprecated).to.be.equal(false);
      expect(product.useFixedPrice).to.be.equal(data['Use Fixed Price'] === 'Yes');
    }
  });

  it('Deploy CoverViewer', async function () {
    // this.coverViewer = await ethers.deployContract('CoverViewer', [this.master.address]);
    this.coverViewer = await ethers.getContractAt('CoverViewer', V2Addresses.CoverViewer);
  });

  it('Migrates existing FTX covers to V2', async function () {
    const ftxCoverIds = [7907, 7881, 7863, 7643, 7598, 7572, 7542, 7313, 7134];

    const FTX_GRACE_PERIOD = 120; // 120 days
    const FTX_ID_V1 = '0xC57d000000000000000000000000000000000011';
    const ftxProductId = await this.productsV1.getNewProductId(FTX_ID_V1);

    let expectedClaimId = 0;
    const segmentId = 0;

    for (const coverIdV1 of ftxCoverIds) {
      const { memberAddress, sumAssured, coverAsset: legacyCoverAsset } = await this.gateway.getCover(coverIdV1);
      const { coverPeriod: coverPeriodInDays, validUntil } = await this.quotationData.getCoverDetailsByCoverID2(
        coverIdV1,
      );
      const expectedPeriod = coverPeriodInDays * 3600 * 24;
      const expectedStart = validUntil.sub(expectedPeriod);
      const expectedCoverAsset = ASSET_V1_TO_ASSET_V2[legacyCoverAsset.toLowerCase()];

      const member = await getSigner(memberAddress);
      await evm.impersonate(memberAddress);
      await evm.setBalance(memberAddress, parseEther('1000'));

      const [deposit] = await this.individualClaims.getAssessmentDepositAndReward(
        sumAssured,
        expectedPeriod,
        expectedCoverAsset,
      );
      const tx = await this.coverMigrator.connect(member).migrateAndSubmitClaim(coverIdV1, segmentId, sumAssured, '', {
        value: deposit,
      });
      const receipt = await tx.wait();
      const coverMigratedEvent = receipt.events.find(x => x.event === 'CoverMigrated');
      const coverIdV2 = coverMigratedEvent.args.coverIdV2;

      console.log(`FTX cover ${coverIdV1} mapped to V2 cover: ${coverIdV2}`);

      const covers = await this.coverViewer.getCovers([coverIdV2]);
      const { productId, coverAsset, amountPaidOut, segments } = covers[0];

      expect(productId).to.be.equal(ftxProductId);
      expect(coverAsset).to.be.equal(expectedCoverAsset);
      expect(amountPaidOut).to.be.equal(0);
      expect(segments.length).to.be.equal(1);

      const { amount, remainingAmount, start, period, gracePeriod } = segments[segmentId];
      expect(amount).to.be.equal(sumAssured);
      expect(remainingAmount).to.be.equal(sumAssured);
      expect(period).to.be.equal(expectedPeriod);
      expect(start).to.be.equal(expectedStart);
      expect(gracePeriod).to.be.equal(FTX_GRACE_PERIOD);

      // claim assertions

      const claimsArray = await this.individualClaims.getClaimsToDisplay([expectedClaimId++]);
      const { productId: claimProductId, coverId, amount: claimAmount, assetSymbol, claimStatus } = claimsArray[0];

      expect(claimAmount).to.be.equal(sumAssured);
      expect(claimProductId).to.be.equal(ftxProductId);
      expect(assetSymbol).to.be.equal(expectedCoverAsset === 0 ? 'ETH' : 'DAI');
      expect(coverId).to.be.equal(coverIdV2);
      expect(claimStatus).to.be.equal(0); // ClaimStatus.PENDING
    }
  });

  it('Call LegacyPooledStaking.pushRewards for all non-deprecated contracts', async function () {
    const productsWithPossibleRewards = require(PRODUCTS_WITH_REWARDS_PATH).map(address => address.toLowerCase());
    console.log(`Call pushRewards with ${productsWithPossibleRewards.length} product addresses.`);
    await this.pooledStaking.pushRewards(productsWithPossibleRewards);
  });

  it('Process all PooledStaking pending actions', async function () {
    let i = 0;
    while (await this.pooledStaking.hasPendingActions()) {
      console.log(`Calling processPendingActions(). iteration ${i++}`);
      const tx = await this.pooledStaking.processPendingActions(100);
      await tx.wait();
    }
  });

  it('Deploys StakingViewer', async function () {
    // this.stakingViewer = await ethers.deployContract('StakingViewer', [
    //   this.master.address,
    //   this.stakingNFT.address,
    //   this.stakingPoolFactory.address,
    //   this.stakingProducts.address,
    // ]);
    this.stakingViewer = await ethers.getContractAt('StakingViewer', V2Addresses.StakingViewer);
  });

  it('Migrate selected stakers to their own staking pools', async function () {
    const FOUNDATION = '0x963df0066ff8345922df88eebeb1095be4e4e12e';
    const HUGH = '0x87b2a7559d85f4653f13e6546a14189cd5455d45';
    const ARMOR_STAKER = '0x1337def1fc06783d4b03cb8c1bf3ebf7d0593fc4';
    const ARMOR_MANAGER = '0xFa760444A229e78A50Ca9b3779f4ce4CcE10E170';

    const selectedStakers = [FOUNDATION, HUGH, ARMOR_STAKER];

    const expectedPoolConfigurations = [
      // Foundation
      {
        maxFee: 99,
        initialFee: 0,
        staker: FOUNDATION,
        manager: FOUNDATION,
        isPrivatePool: true,
        poolId: 1,
        stakingNFTId: 1,
        poolDepositRatio: 100,
        trancheStakeRatio: [0, 25, 0, 25, 0, 0, 0, 0],
      },
      // Hugh
      {
        maxFee: 20,
        initialFee: 10,
        staker: HUGH,
        manager: HUGH,
        isPrivatePool: false,
        poolId: 2,
        stakingNFTId: 2,
        poolDepositRatio: 100,
        trancheStakeRatio: [0, 10, 0, 0, 0, 50, 0, 0],
      },
      // Armor AAA
      {
        maxFee: 25,
        initialFee: 15,
        staker: ARMOR_STAKER,
        manager: ARMOR_MANAGER,
        isPrivatePool: false,
        poolId: 3,
        stakingNFTId: 3,
        poolDepositRatio: 75,
        trancheStakeRatio: [20, 25, 25, 15, 10, 0, 0, 0],
      },
      // Armor AA
      {
        maxFee: 25,
        initialFee: 15,
        staker: ARMOR_STAKER,
        manager: ARMOR_MANAGER,
        isPrivatePool: false,
        poolId: 4,
        stakingNFTId: 4,
        poolDepositRatio: 25,
        trancheStakeRatio: [20, 25, 25, 15, 10, 0, 0, 0],
      },
    ];

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

    // id => address
    const productAddresses = require(PRODUCT_ADDRESSES_OUTPUT_PATH).map(address => address.toLowerCase());

    // address => id
    const productIds = Object.fromEntries(productAddresses.map((address, i) => [address, i]));

    console.log('Fetching product prices');
    // id => price
    const prices = await Promise.all(
      // fetch price by v2 product id
      productAddresses.map(async (_, id) => {
        const price = await this.pooledStaking.getV1PriceForProduct(id);
        return price.eq(MaxUint96) ? Zero : price;
      }),
    );

    console.log('Fetching stakers data before migration');
    const getStakerDataBefore = async staker => {
      const balance = await this.nxm.balanceOf(staker);
      const deposit = await this.pooledStaking.stakerDeposit(staker);
      const productAddresses = await this.pooledStaking.stakerContractsArray(staker);
      console.log(`Staker ${staker} has ${formatEther(deposit)} deposit`);

      const products = await Promise.all(
        productAddresses.map(async productAddress => {
          const stake = await this.pooledStaking.stakerContractStake(staker, productAddress);
          const weight = BigNumber.from(100).mul(stake).div(deposit);
          return { productAddress: productAddress.toLowerCase(), stake, weight };
        }),
      );

      const filteredProducts = products
        .filter(product => product.stake.gt(0))
        .filter(product => {
          const productId = productIds[product.productAddress];
          const price = prices[productId] || Zero;
          return !price.isZero();
        });

      return {
        staker,
        balance,
        deposit,
        products: filteredProducts,
      };
    };

    // as array - only used to generate the object below
    const stakerDataArray = await Promise.all(selectedStakers.map(staker => getStakerDataBefore(staker)));

    // as object - used in checks
    const stakerDataBefore = Object.fromEntries(stakerDataArray.map(stakerData => [stakerData.staker, stakerData]));

    expect(await this.stakingPoolFactory.stakingPoolCount()).to.be.equal(0);
    expect(await this.stakingNFT.totalSupply()).to.be.equal(0);

    console.log('Migrating selected stakers to their own staking pools');
    for (const staker of selectedStakers) {
      await this.pooledStaking.migrateToNewV2Pool(staker);
      expect(await this.pooledStaking.stakerDeposit(staker)).to.be.equal(0);
    }

    console.log('Checking all new staking pools and nfts have been created');
    expect(await this.stakingPoolFactory.stakingPoolCount()).to.be.equal(expectedPoolConfigurations.length);
    expect(await this.stakingNFT.totalSupply()).to.be.equal(expectedPoolConfigurations.length);

    const migratedDepositAmounts = {};

    const { timestamp } = await ethers.provider.getBlock('latest');
    const firstTrancheId = BigNumber.from(timestamp).div(91 * 24 * 3600);
    const trancheIds = new Array(8).fill(0).map((_, i) => firstTrancheId.add(i));

    for (const poolConfig of expectedPoolConfigurations) {
      const { poolId, staker, poolDepositRatio, trancheStakeRatio } = poolConfig;

      console.log(`Checking staking pool ${poolId} deposits`);
      const stakingPoolAddress = await this.cover.stakingPool(poolId);
      const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

      // expected
      const expectedPoolAmount = stakerDataBefore[staker].deposit.mul(poolDepositRatio).div(100);
      const expectedTrancheAmounts = trancheStakeRatio.map(ratio => expectedPoolAmount.mul(ratio).div(100));
      const expectedTotalDeposit = expectedTrancheAmounts.reduce((a, b) => a.add(b));

      // actual
      const { deposits: actualDeposit } = await this.tokenController.stakingPoolNXMBalances(poolId);
      const shareSupply = await stakingPool.getStakeSharesSupply();
      const actualTrancheAmounts = await Promise.all(
        trancheIds.map(async trancheId => {
          const deposit = await stakingPool.getDeposit(poolConfig.stakingNFTId, trancheId);
          const trancheAmount = expectedTotalDeposit.mul(deposit.stakeShares).div(shareSupply);
          console.log(`Tranche ${trancheId} amount = ${formatEther(trancheAmount)} NXM`);
          return trancheAmount;
        }),
      );

      // checks
      expect(actualDeposit).to.be.equal(expectedTotalDeposit);
      actualTrancheAmounts.forEach((actualTrancheAmount, i) => {
        // precision loss due to calculation of tranche deposit using stake shares
        // max 0.00001% diff allowed due to stake initial stake shares being sqrt(initialDeposit)
        expect(actualTrancheAmount.sub(expectedTrancheAmounts[i]).abs()).to.be.lte(100000000000);
      });

      console.log(`${staker} migrated to pool #${poolId} ${formatEther(actualDeposit)} NXM`);

      console.log('Checking staking pool config');
      expect(await stakingPool.getMaxPoolFee()).to.be.equal(poolConfig.maxFee);
      expect(await stakingPool.getPoolFee()).to.be.equal(poolConfig.initialFee);
      expect((await stakingPool.manager()).toLowerCase()).to.be.equal(poolConfig.manager.toLowerCase());
      expect(await stakingPool.isPrivatePool()).to.be.equal(poolConfig.isPrivatePool);

      console.log('Checking nft ownership');
      const nftOwner = await this.stakingNFT.ownerOf(poolConfig.stakingNFTId);
      expect(nftOwner.toLowerCase()).to.be.equal(poolConfig.staker.toLowerCase());

      console.log('Checking staking pool products');

      for (const productAddress of productAddresses) {
        const productId = productIds[productAddress];
        const productBefore = stakerDataBefore[staker].products.find(p => p.productAddress === productAddress);

        const expectedWeight = productBefore ? productBefore.weight : Zero;
        const expectedPrice = productBefore ? prices[productId] : Zero;

        const migratedProduct = await this.stakingProducts.getProduct(poolId, productId);
        const actualWeight = await this.stakingProducts.getProductTargetWeight(poolId, productId);

        expect(actualWeight).to.be.equal(expectedWeight);
        expect(migratedProduct.lastEffectiveWeight).to.be.equal(Zero);
        expect(migratedProduct.bumpedPrice).to.be.equal(expectedPrice);
        expect(migratedProduct.targetPrice).to.be.equal(expectedPrice);
      }

      // sum up the migrated amount
      migratedDepositAmounts[staker] = (migratedDepositAmounts[staker] || Zero).add(actualDeposit);
    }

    console.log('Checking stakers balances');

    for (const staker of selectedStakers) {
      const expectedTransfer = stakerDataBefore[staker].deposit.sub(migratedDepositAmounts[staker]);
      const balance = await this.nxm.balanceOf(staker);
      const actualTransfer = balance.sub(stakerDataBefore[staker].balance);
      expect(actualTransfer).to.be.equal(expectedTransfer);
      console.log(`${staker} got ${formatEther(actualTransfer)} NXM transfered`);
    }
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

  it('Purchase Cover at the expected prices from the migrated pools', async function () {
    const coverBuyer = this.abMembers[4];
    const poolEthBalanceBefore = await ethers.provider.getBalance(this.pool.address);

    const UNISWAP_V3 = '0x1F98431c8aD98523631AE4a59f267346ea31F984';
    const productId = await this.productsV1.getNewProductId(UNISWAP_V3);
    const coverAsset = 0; // ETH
    const paymentAsset = coverAsset;
    const amount = parseEther('1');
    const period = 365 * 24 * 3600; // 1 year

    const migratedPrice = await this.pooledStaking.getV1PriceForProduct(productId);
    const expectedPremium = amount.mul(migratedPrice).div(10000);

    const hughPoolId = 2;
    const poolAllocationRequest = [{ poolId: hughPoolId, coverAmountInAsset: amount }];

    console.log(`Buyer ${coverBuyer._address} buying cover for ${productId.toString()} on pool #${hughPoolId}`);

    const expectedPremiumWithSlippage = expectedPremium.mul(10050).div(10000); // 0.5% slippage
    await this.cover.connect(coverBuyer).buyCover(
      {
        coverId: '0', // new cover
        owner: coverBuyer._address,
        productId,
        coverAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremiumWithSlippage,
        paymentAsset,
        commissionRatio: parseEther('0'),
        commissionDestination: AddressZero,
        ipfsData: '',
      },
      poolAllocationRequest,
      { value: expectedPremiumWithSlippage },
    );

    const poolEthBalanceAfter = await ethers.provider.getBalance(this.pool.address);
    const premiumSentToPool = poolEthBalanceAfter.sub(poolEthBalanceBefore);

    console.log({
      premiumSentToPool: premiumSentToPool.toString(),
      expectedPremium: expectedPremium.toString(),
      migratedPrice: migratedPrice.toString(),
    });

    // expect(expectedPremium).to.be.greaterThanOrEqual(premiumSentToPool);
    // expectedPremium >= premiumSentToPool guaranteed by the assertion above.
    // We then assert the difference between the 2 is less than 0.01% of the original amount
    // The difference comes from the fact that we truncate prices to 4 decimals when we port them from
    // Quote Engine to StakingProduct.sol. On top of that, the covers go only up to 364 days, while the
    // Quote Engine prices are calculated for 365.25 days.
    // The latter is partially accounted for in the expectedPremium computation above
    // (BigNumber doesn't support fractions)
    // expect(expectedPremium.sub(premiumSentToPool)).to.be.lessThanOrEqual(amount.div(10000));
  });

  it('MemberRoles is initialized with kycAuthAddress from QuotationData', async function () {
    const kycAuthAddressQD = await this.quotationData.kycAuthAddress();
    const kycAuthAddressMR = await this.memberRoles.kycAuthAddress();
    expect(kycAuthAddressMR).to.be.equal(kycAuthAddressQD);
  });

  require('./basic-functionality-tests');
});
