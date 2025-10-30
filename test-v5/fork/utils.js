const evm = require('./evm')();
const { artifacts, ethers, network } = require('hardhat');
const assert = require('assert');

const { setEtherBalance } = require('../utils/evm');
const { calculateCurrentTrancheId } = require('../utils/stakingPool');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { parseEther, defaultAbiCoder, keccak256, toUtf8Bytes } = ethers.utils;
const { BigNumber } = ethers;

const MaxAddress = '0xffffffffffffffffffffffffffffffffffffffff';

const V2Addresses = {
  Assessment: '0xcafeaa5f9c401b7295890f309168Bbb8173690A3',
  Cover: '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62',
  CoverMigrator: '0xcafeac41b010299A9bec5308CCe6aFC2c4DF8D39',
  CoverNFT: '0xcafeaCa76be547F14D0220482667B42D8E7Bc3eb',
  CoverNFTDescriptor: '0xcafead1E31Ac8e4924Fc867c2C54FAB037458cb9',
  CoverViewer: '0xcafea84e199C85E44F34CD75374188D33FB94B4b',
  Governance: '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900',
  IndividualClaims: '0xcafeac12feE6b65A710fA9299A98D65B4fdE7a62',
  LegacyClaimData: '0xdc2D359F59F6a26162972c3Bd0cFBfd8C9Ef43af',
  LegacyClaimProofs: '0xcafea81b73daB8F42C5eca7d2E821A82660B6775',
  LegacyClaimsReward: '0xcafeaDcAcAA2CD81b3c54833D6896596d218BFaB',
  LegacyGateway: '0x089Ab1536D032F54DFbC194Ba47529a4351af1B5',
  LegacyPooledStaking: '0x84EdfFA16bb0b9Ab1163abb0a13Ff0744c11272f',
  LegacyQuotationData: '0x1776651F58a17a50098d31ba3C3cD259C1903f7A',
  MCR: '0xcafea92739e411a4D95bbc2275CA61dE6993C9a7',
  MemberRoles: '0x055CC48f7968FD8640EF140610dd4038e1b03926',
  NXMaster: '0x01BFd82675DBCc7762C84019cA518e701C0cD07e',
  NXMToken: '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B',
  Pool: '0xcafeaBED7e0653aFe9674A3ad862b78DB3F36e60',
  PriceFeedOracle: '0xcafeaf6f31b54931795DA9055910DA7C83D23495',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  ProposalCategory: '0x888eA6Ab349c854936b98586CE6a17E98BF254b2',
  Ramm: '0xcafea54f03E1Cc036653444e581A10a43B2487CD',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingPoolImpl: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingProducts: '0xcafea573fBd815B5f59e8049E71E554bde3477E4',
  StakingViewer: '0xcafea970135C07B07a3eCA76C6c00AAC849767b3',
  SwapOperator: '0xcafea5C050E74a21C11Af78C927e17853153097D',
  TokenController: '0x5407381b6c251cFd498ccD4A1d877739CB7960B8',
  YieldTokenIncidents: '0xcafeac831dC5ca0D7ef467953b7822D2f44C8f83',
};

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI_ADDRESS: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  USDC_ADDRESS: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  CBBTC_ADDRESS: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
  WETH_ADDRESS: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  STETH_ADDRESS: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  RETH_ADDRESS: '0xae78736cd615f374d3085123a210448e74fc6393',
  AWETH_ADDRESS: '0x4d5F47FA6A74757f35C14fD3a6Ef8E3C9BC514E8',
  SWAP_CONTROLLER: '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f',
  COWSWAP_SETTLEMENT: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
  COWSWAP_SOLVER: '0x423cEc87f19F0778f549846e0801ee267a917935',
  COWSWAP_RELAYER: '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110',
};

const UserAddress = {
  NXM_WHALE_1: '0x25783b67b5e29c48449163db19842b8531fdde43',
  NXM_WHALE_2: '0xd3A6BEB10FFF934543976bC0a30d6B4368c0775b', // NOTE: no longer have NXM
  NXM_AB_MEMBER: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
  DAI_HOLDER: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
  DAI_NXM_HOLDER: '0x526C7665C5dd9cD7102C6d42D407a0d9DC1e431d',
  CBBTC_WHALE: '0x5c647cE0Ae10658ec44FA4E11A51c96e94efd1Dd',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
  USDC_HOLDER: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
};

const EnzymeAdress = {
  ENZYMEV4_VAULT_PROXY_ADDRESS: '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD',
  ENZYME_FUND_VALUE_CALCULATOR_ROUTER: '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9',
  ENZYME_COMPTROLLER_PROXY_ADDRESS: '0x01F328d6fbe73d3cf25D00a43037EfCF8BfA6F83',
  ENZYME_ADDRESS_LIST_REGISTRY: '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff',
};

const PriceFeedOracle = {
  // ETH aggragators
  DAI_ETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  STETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
  ENZYMEV4_VAULT_ETH_PRICE_FEED_ORACLE_AGGREGATOR: '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7',
  RETH_ETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x536218f9E9Eb48863970252233c8F271f554C2d0',
  USDC_ETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x986b5e1e1755e3c2440e960477f25201b0a8bbd4',
  // USD aggregators
  CBBTC_USD_PRICE_FEED_ORACLE_AGGREGATOR: '0x2665701293fCbEB223D11A08D826563EDcCE423A',
  ETH_USD_PRICE_FEED_ORACLE_AGGREGATOR: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
};

const AggregatorType = {
  ETH: 0,
  USD: 1,
};

const Aave = {
  POOL_V3_ADDRESS: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
  POOL_DATA_PROVIDER: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
  WETH_GATEWAY_ADDRESS: '0xD322A49006FC828F9B5B37Ab215F99B4E5caB19C',
  VARIABLE_DEBT_USDC_ADDRESS: '0x72E95b8931767C79bA4EeE721354d6E99a61D004',
};

const ratioScale = BigNumber.from('10000');

const ListIdForReceivers = 218;

async function submitGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  await Promise.all(signers.map(signer => gv.connect(signer).submitVote(id, 1)));

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  assert(
    receipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
}

async function submitMemberVoteGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();
  await evm.connect(ethers.provider);

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  await Promise.all(signers.map(signer => gv.connect(signer).submitVote(id, 1)));

  await evm.increaseTime(7 * 24 * 3600); // for DMCI it needs time to pass or to have over 8k voters

  const tx = await gv.closeProposal(id, { gasLimit: 21e6 });
  const receipt = await tx.wait();

  await evm.increaseTime(24 * 3600);

  assert.equal(
    receipt.events.some(x => x.event === 'ProposalAccepted' && x.address === gv.address),
    true,
    'ProposalAccepted was expected',
  );

  const triggerTx = await gv.triggerAction(id);
  const triggerTxReceipt = await triggerTx.wait();
  assert.equal(
    triggerTxReceipt.events.some(x => x.event === 'ActionSuccess' && x.address === gv.address),
    true,
    'ActionSuccess was expected',
  );

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3, 'Proposal Status != ACCEPTED');
}

const getSigner = async address => {
  const provider =
    network.name !== 'hardhat' // ethers errors out when using non-local accounts
      ? new ethers.providers.JsonRpcProvider(network.config.url)
      : ethers.provider;
  return provider.getSigner(address);
};

const toBytes = (string, size = 32) => {
  assert(string.length <= size, `String is too long to fit in ${size} bytes`);
  return '0x' + Buffer.from(string.padEnd(size, '\0')).toString('hex');
};

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;

const fund = async (from, to) => from.sendTransaction({ to, value: parseEther('1000') });

const unlock = async address => {
  await ethers.provider.send('hardhat_impersonateAccount', [address]);
  return await ethers.getSigner(address);
};

async function enableAsEnzymeReceiver(receiverAddress) {
  await evm.connect(ethers.provider);

  const comptroller = await ethers.getContractAt('IEnzymeV4Comptroller', EnzymeAdress.ENZYME_COMPTROLLER_PROXY_ADDRESS);
  const vault = await ethers.getContractAt('IEnzymeV4Vault', EnzymeAdress.ENZYMEV4_VAULT_PROXY_ADDRESS);
  const ownerAddress = await vault.getOwner();

  // Unlock and funding vault owner
  const owner = await getSigner(ownerAddress);
  await evm.impersonate(ownerAddress);
  await evm.setBalance(ownerAddress, parseEther('1000'));

  // Update Enzyme vault receivers
  const iface = new ethers.utils.Interface(['function addToList(uint256,address[])']);
  const selector = iface.getSighash('addToList');
  const receiverArgs = defaultAbiCoder.encode(['uint256', 'address[]'], [ListIdForReceivers, [receiverAddress]]);
  await comptroller
    .connect(owner)
    .vaultCallOnContract(EnzymeAdress.ENZYME_ADDRESS_LIST_REGISTRY, selector, receiverArgs);

  // Check that Enzyme vault receivers contains the Pool address
  const registry = await ethers.getContractAt('IAddressListRegistry', EnzymeAdress.ENZYME_ADDRESS_LIST_REGISTRY);
  const inReceiverList = await registry.isInList(ListIdForReceivers, receiverAddress);
  assert.equal(inReceiverList, true);
}

// Returns any products that are initialized have target weight > 0
// These products should be able to be bought if there is capacity
async function getActiveProductsInPool(params) {
  const { stakingProducts, cover } = this;
  const { poolId } = params;

  // get products from staking pool and discard if not initialized
  const numProducts = await cover.productsCount();
  const productsInThisPool = [];

  // TODO: multicall
  for (let i = 0; i < numProducts; i++) {
    const { targetWeight, lastEffectiveWeight, bumpedPrice, bumpedPriceUpdateTime, targetPrice } =
      await stakingProducts.getProduct(poolId, i);

    if (ethers.constants.One.mul(bumpedPrice).isZero()) {
      continue;
    }

    if (ethers.constants.One.mul(targetWeight).eq(0)) {
      continue;
    }
    productsInThisPool.push({
      targetWeight,
      lastEffectiveWeight,
      productId: i,
      bumpedPrice,
      targetPrice,
      bumpedPriceUpdateTime,
    });
  }
  return productsInThisPool;
}

async function getConfig() {
  let { cover, stakingPool, stakingProducts } = this;

  if (stakingPool === undefined) {
    stakingPool = await ethers.getContractAt('StakingPool', await cover.stakingPool(1));
  }

  const config = {
    PRICE_CHANGE_PER_DAY: stakingProducts.PRICE_CHANGE_PER_DAY(),
    PRICE_BUMP_RATIO: stakingProducts.PRICE_BUMP_RATIO(),
    NXM_PER_ALLOCATION_UNIT: stakingPool.NXM_PER_ALLOCATION_UNIT(),
    ALLOCATION_UNITS_PER_NXM: stakingPool.ALLOCATION_UNITS_PER_NXM(),
    INITIAL_PRICE_DENOMINATOR: stakingProducts.INITIAL_PRICE_DENOMINATOR(),
    REWARDS_DENOMINATOR: stakingPool.REWARDS_DENOMINATOR(),
    WEIGHT_DENOMINATOR: stakingPool.WEIGHT_DENOMINATOR(),
    CAPACITY_REDUCTION_DENOMINATOR: stakingPool.CAPACITY_REDUCTION_DENOMINATOR(),
    TARGET_PRICE_DENOMINATOR: stakingProducts.TARGET_PRICE_DENOMINATOR(),
    POOL_FEE_DENOMINATOR: stakingPool.POOL_FEE_DENOMINATOR(),
    GLOBAL_CAPACITY_DENOMINATOR: stakingPool.GLOBAL_CAPACITY_DENOMINATOR(),
    TRANCHE_DURATION: stakingProducts.TRANCHE_DURATION(),
    GLOBAL_CAPACITY_RATIO: cover.globalCapacityRatio(),
    GLOBAL_REWARDS_RATIO: cover.getGlobalRewardsRatio(),
    DEFAULT_MIN_PRICE_RATIO: cover.DEFAULT_MIN_PRICE_RATIO(),
  };
  await Promise.all(Object.keys(config).map(async key => (config[key] = await config[key])));
  return config;
}

async function upgradeMultipleContracts(params) {
  const { codes, addresses } = params;

  const contractCodes = codes.map(code => ethers.utils.toUtf8Bytes(code));
  const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);

  const implAddresses = addresses.map(c => c.address);
  const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
  const { memberArray: abMembersAddresses } = await memberRoles.members(1);

  // Impersonate and fund advisory board members
  await Promise.all(abMembersAddresses.map(addr => setEtherBalance(addr, parseEther('1000'))));
  const abMembers = await Promise.all(abMembersAddresses.map(addr => ethers.getImpersonatedSigner(addr)));

  await submitGovernanceProposal(
    PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
    defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, implAddresses]),
    abMembers,
    governance,
  );
  return abMembers;
}

/**
 * Formats the result of master.getInternalContracts() to a readable logging format
 */
function formatInternalContracts({ _contractAddresses, _contractCodes }) {
  return _contractCodes.map((code, i) => {
    const index = `${i}`.padStart(2, '0');
    return `[${index}] ${Buffer.from(code.slice(2), 'hex')} -> ${_contractAddresses[i]}`;
  });
}

function calculateProxyAddress(masterAddress, salt) {
  const { bytecode } = artifacts.readArtifactSync('OwnedUpgradeabilityProxy');
  const initCode = bytecode + defaultAbiCoder.encode(['address'], [MaxAddress]).slice(2);
  const initCodeHash = keccak256(initCode);
  const saltHex = Buffer.from(salt.toString(16).padStart(64, '0'), 'hex');
  return ethers.utils.getCreate2Address(masterAddress, saltHex, initCodeHash);
}

async function getContractByContractCode(contractName, contractCode) {
  this.master = this.master ?? (await ethers.getContractAt('NXMaster', V2Addresses.NXMaster));
  const contractAddress = await this.master?.getLatestAddress(toUtf8Bytes(contractCode));
  return ethers.getContractAt(contractName, contractAddress);
}

module.exports = {
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  calculateCurrentTrancheId,
  getSigner,
  toBytes,
  Address,
  UserAddress,
  EnzymeAdress,
  PriceFeedOracle,
  AggregatorType,
  Aave,
  getAddressByCodeFactory,
  fund,
  unlock,
  ratioScale,
  enableAsEnzymeReceiver,
  V2Addresses,
  getConfig,
  getActiveProductsInPool,
  upgradeMultipleContracts,
  formatInternalContracts,
  calculateProxyAddress,
  getContractByContractCode,
};
