const evm = require('./evm')();
const { web3, ethers, network } = require('hardhat');
const assert = require('assert');
const { toBN } = web3.utils;
const { parseEther } = ethers.utils;

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI_ADDRESS: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  WETH_ADDRESS: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  STETH_ADDRESS: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
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
  ENZYME_COMPTROLLER_PROXY_ADDRESS: '0xa5bf4350da6193b356ac15a3dbd777a687bc216e',
  ENZYME_ADDRESS_LIST_REGISTRY: '0x4eb4c7babfb5d54ab4857265b482fb6512d22dff',
};

const PriceFeedOracle = {
  DAI_PRICE_FEED_ORACLE_AGGREGATOR: '0x773616E4d11A78F511299002da57A0a94577F1f4',
  STETH_PRICE_FEED_ORACLE_AGGREGATOR: '0x86392dC19c0b719886221c78AB11eb8Cf5c52812',
  ENZYMEV4_VAULT_PRICE_FEED_ORACLE_AGGREGATOR: '0xCc72039A141c6e34a779eF93AEF5eB4C82A893c7',
};

const ratioScale = toBN('10000');

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
  console.log('Enzyme vault owner address:', ownerAddress);

  // Unlock and funding vault owner
  const owner = await getSigner(ownerAddress);
  await evm.impersonate(ownerAddress);
  await evm.setBalance(ownerAddress, parseEther('1000'));

  // Update Enzyme vault receivers
  const selector = web3.eth.abi.encodeFunctionSignature('addToList(uint256,address[])');
  const receiverArgs = web3.eth.abi.encodeParameters(['uint256', 'address[]'], [ListIdForReceivers, [receiverAddress]]);
  await comptroller
    .connect(owner)
    .vaultCallOnContract(EnzymeAdress.ENZYME_ADDRESS_LIST_REGISTRY, selector, receiverArgs);

  // Check that Enzyme vault receivers contains the Pool address
  const registry = await ethers.getContractAt('IAddressListRegistry', EnzymeAdress.ENZYME_ADDRESS_LIST_REGISTRY);
  const inReceiverList = await registry.isInList(ListIdForReceivers, receiverAddress);
  assert.equal(inReceiverList, true);
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
};
