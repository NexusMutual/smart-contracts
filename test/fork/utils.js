const evm = require('./evm')();
const { artifacts, ethers, network } = require('hardhat');
const assert = require('assert');

const { setEtherBalance } = require('../utils/evm');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { parseEther, defaultAbiCoder, keccak256 } = ethers.utils;
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
  MCR: '0xcafea444db21dc06f34570185cF0014701c7D62e',
  MemberRoles: '0x055CC48f7968FD8640EF140610dd4038e1b03926',
  NXMaster: '0x01BFd82675DBCc7762C84019cA518e701C0cD07e',
  NXMToken: '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B',
  Pool: '0xcafea112Db32436c2390F5EC988f3aDB96870627',
  PriceFeedOracle: '0xcafeaf6f31b54931795DA9055910DA7C83D23495',
  ProductsV1: '0xcafeab02966FdC69Ce5aFDD532DD51466892E32B',
  ProposalCategory: '0x888eA6Ab349c854936b98586CE6a17E98BF254b2',
  StakingNFT: '0xcafea508a477D94c502c253A58239fb8F948e97f',
  StakingNFTDescriptor: '0xcafea534e156a41b3e77f29Bf93C653004f1455C',
  StakingPoolImpl: '0xcafeacf62FB96fa1243618c4727Edf7E04D1D4Ca',
  StakingPoolFactory: '0xcafeafb97BF8831D95C0FC659b8eB3946B101CB3',
  StakingProducts: '0xcafea573fBd815B5f59e8049E71E554bde3477E4',
  StakingViewer: '0xcafea2B7904eE0089206ab7084bCaFB8D476BD04',
  SwapOperator: '0xcafea536d7f79F31Fa49bC40349f6a5F7E19D842',
  TokenController: '0x5407381b6c251cFd498ccD4A1d877739CB7960B8',
  YieldTokenIncidents: '0xcafeac831dC5ca0D7ef467953b7822D2f44C8f83',
};

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI_ADDRESS: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WETH_ADDRESS: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  STETH_ADDRESS: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  RETH_ADDRESS: '0xae78736cd615f374d3085123a210448e74fc6393',
  SWAP_CONTROLLER: '0x551D5500F613a4beC77BA8B834b5eEd52ad5764f',
  COWSWAP_SETTLEMENT: '0x9008D19f58AAbD9eD0D60971565AA8510560ab41',
};

const UserAddress = {
  NXM_WHALE_1: '0x25783b67b5e29c48449163db19842b8531fdde43',
  NXM_WHALE_2: '0x598dbe6738e0aca4eabc22fed2ac737dbd13fb8f',
  NXM_AB_MEMBER: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
  DAI_HOLDER: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
  DAI_NXM_HOLDER: '0x526C7665C5dd9cD7102C6d42D407a0d9DC1e431d',
  HUGH: '0x87b2a7559d85f4653f13e6546a14189cd5455d45',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

const EnzymeAdress = {
  ENZYMEV4_VAULT_PROXY_ADDRESS: '0x27F23c710dD3d878FE9393d93465FeD1302f2EbD',
  ENZYME_FUND_VALUE_CALCULATOR_ROUTER: '0x7c728cd0CfA92401E01A4849a01b57EE53F5b2b9',
  ENZYME_COMPTROLLER_PROXY_ADDRESS: '0x01F328d6fbe73d3cf25D00a43037EfCF8BfA6F83',
  ENZYME_ADDRESS_LIST_REGISTRY: '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff',
};

const PriceFeedOracle = {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  STETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR: '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7',
  RETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x536218f9E9Eb48863970252233c8F271f554C2d0',
};

const ratioScale = BigNumber.from('10000');

const ListIdForReceivers = 218;

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

async function submitMemberVoteGovernanceProposal(categoryId, actionData, signers, gv) {
  const id = await gv.getProposalLength();
  await evm.connect(ethers.provider);

  console.log(`Proposal ${id}`);

  await gv.connect(signers[0]).createProposal('', '', '', 0);
  await gv.connect(signers[0]).categorizeProposal(id, categoryId, 0);
  await gv.connect(signers[0]).submitProposalWithSolution(id, '', actionData);

  for (let i = 0; i < signers.length; i++) {
    await gv.connect(signers[i]).submitVote(id, 1);
  }

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

async function calculateCurrentTrancheId() {
  const lastBlock = await ethers.provider.getBlock('latest');
  return Math.floor(lastBlock.timestamp / (91 * 24 * 3600));
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
    REWARD_BONUS_PER_TRANCHE_RATIO: stakingPool.REWARD_BONUS_PER_TRANCHE_RATIO(),
    REWARD_BONUS_PER_TRANCHE_DENOMINATOR: stakingPool.REWARD_BONUS_PER_TRANCHE_DENOMINATOR(),
    PRICE_CHANGE_PER_DAY: stakingProducts.PRICE_CHANGE_PER_DAY(),
    PRICE_BUMP_RATIO: stakingProducts.PRICE_BUMP_RATIO(),
    SURGE_PRICE_RATIO: stakingProducts.SURGE_PRICE_RATIO(),
    SURGE_THRESHOLD_DENOMINATOR: stakingProducts.SURGE_THRESHOLD_DENOMINATOR(),
    SURGE_THRESHOLD_RATIO: stakingProducts.SURGE_THRESHOLD_RATIO(),
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
    GLOBAL_REWARDS_RATIO: cover.globalRewardsRatio(),
    GLOBAL_MIN_PRICE_RATIO: cover.GLOBAL_MIN_PRICE_RATIO(),
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
};
