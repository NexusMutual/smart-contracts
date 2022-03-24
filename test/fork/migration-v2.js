const { artifacts, ethers, config, network, run } = require('hardhat');
const hre = require('hardhat');

const { getEnv, hex } = require('../lib/helpers');
const proposalCategories = require('../../lib/proposal-categories');

// external
const ERC20MintableDetailed = artifacts.require('ERC20MintableDetailed');
const OwnedUpgradeabilityProxy = artifacts.require('OwnedUpgradeabilityProxy');
const UniswapV2Factory = artifacts.require('UniswapV2Factory');

// nexusmutual
const NXMToken = artifacts.require('NXMToken');
const LegacyClaims = artifacts.require('LegacyClaims');
const LegacyClaimsData = artifacts.require('LegacyClaimsData');
const LegacyClaimsReward = artifacts.require('LegacyClaimsReward');
const LegacyClaimProofs = artifacts.require('LegacyClaimProofs');
const Claims = artifacts.require('Claims');
const Incidents = artifacts.require('Incidents');
const Assessment = artifacts.require('Assessment');
const TokenData = artifacts.require('TokenData');
const Pool = artifacts.require('Pool');
const Quotation = artifacts.require('Quotation');
const QuotationData = artifacts.require('TestnetQuotationData');
const PriceFeedOracle = artifacts.require('PriceFeedOracle');
const SwapOperator = artifacts.require('SwapOperator');
const TwapOracle = artifacts.require('TwapOracle');
const DisposableMCR = artifacts.require('DisposableMCR');
const Cover = artifacts.require('Cover');

// temporary contracts used for initialization
const DisposableNXMaster = artifacts.require('DisposableNXMaster');
const DisposableMemberRoles = artifacts.require('DisposableMemberRoles');
const DisposableTokenController = artifacts.require('DisposableTokenController');
const DisposableProposalCategory = artifacts.require('DisposableProposalCategory');
const DisposableGovernance = artifacts.require('DisposableGovernance');
const DisposablePooledStaking = artifacts.require('DisposablePooledStaking');
const DisposableGateway = artifacts.require('DisposableGateway');
const DisposableCover = artifacts.require('DisposableCover');
const CoverNFT = artifacts.require('CoverNFT');
const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

// target contracts
const TestnetNXMaster = artifacts.require('TestnetNXMaster');
const MemberRoles = artifacts.require('MemberRoles');
const TokenController = artifacts.require('TokenController');
const ProposalCategory = artifacts.require('ProposalCategory');
const Governance = artifacts.require('Governance');
const PooledStaking = artifacts.require('PooledStaking');
const ProductsV1 = artifacts.require('ProductsV1');
const Gateway = artifacts.require('Gateway');

// external contracts
const DistributorFactory = artifacts.require('DistributorFactory');
const SelfKyc = artifacts.require('SelfKyc');
const ChainlinkAggregatorMock = artifacts.require('ChainlinkAggregatorMock');

const INITIAL_SUPPLY = ether('1500000');
const etherscanApiKey = getEnv('ETHERSCAN_API_KEY');

const UNISWAP_FACTORY = '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f';
const WETH_ADDRESS = '0xd0a1e359811322d97991e03f863a0c30c2cf029c';

// source: https://docs.chain.link/docs/price-feeds-migration-august-2020
const CHAINLINK_DAI_ETH_AGGREGATORS = {
  hardhat: '0x0000000000000000000000000000000000000000',
  mainnet: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  rinkeby: '0x2bA49Aaa16E6afD2a993473cfB70Fa8559B523cF',
  kovan: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
  tenderly: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
  // used when running hh node to fork a network, change me if needed
  localhost: '0x22B58f1EbEDfCA50feF632bD73368b2FdA96D541',
};

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

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

describe('v2 migration', function () {
  this.timeout(0);

  it('initializes old contracts', async function () {
    const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
    const factory = await getContractFactory(provider);

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
    this.claims = await factory('CL');
    this.claimRewards = await factory('CR');
    this.claimsData = await factory('CD');
  });

  it('updates governance contract', async function () {});
});
