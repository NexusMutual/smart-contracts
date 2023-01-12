const { time, expectEvent } = require('@openzeppelin/test-helpers');
const { web3, ethers } = require('hardhat');
const { toBN } = web3.utils;
const { parseEther } = ethers.utils;

const Address = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  NXMHOLDER: '0xd7cba5b9a0240770cfd9671961dae064136fa240',
};

const UserAddress = {
  NXM_WHALE_1: '0x25783b67b5e29c48449163db19842b8531fdde43',
  NXM_WHALE_2: '0x598dbe6738e0aca4eabc22fed2ac737dbd13fb8f',
  NXM_AB_MEMBER: '0x87B2a7559d85f4653f13E6546A14189cd5455d45',
  DAI_HOLDER: '0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503',
  HUGH: '0x87b2a7559d85f4653f13e6546a14189cd5455d45',
};

const ratioScale = toBN('10000');

async function submitGovernanceProposal(categoryId, actionData, members, gv) {
  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  const from = members[0];
  await gv.createProposal('', '', '', 0, { from });
  await gv.categorizeProposal(id, categoryId, 0, { from });
  await gv.submitProposalWithSolution(id, '', actionData, { from });

  for (let i = 0; i < 3; i++) {
    await gv.submitVote(id, 1, { from: members[i] });
  }

  await time.increase(604800);
  const closeTx = await gv.closeProposal(id, { from });
  expectEvent(closeTx, 'ActionSuccess', { proposalId: id });

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
}

async function submitMemberVoteGovernanceProposal(categoryId, actionData, members, gv) {
  const id = await gv.getProposalLength();
  console.log(`Creating proposal ${id}`);

  const from = members[0];
  await gv.createProposal('', '', '', 0, { from });
  await gv.categorizeProposal(id, categoryId, 0, { from });
  await gv.submitProposalWithSolution(id, '', actionData, { from });

  for (let i = 0; i < 3; i++) {
    await gv.submitVote(id, 1, { from: members[i] });
  }

  await time.increase(604800);
  const closeTx = await gv.closeProposal(id, { from });
  expectEvent(closeTx, 'ProposalAccepted', { proposalId: id });

  await time.increase(24 * 3600);
  const triggerTx = await gv.triggerAction(id);
  expectEvent(triggerTx, 'ActionSuccess', { proposalId: id });

  const proposal = await gv.proposal(id);
  assert.equal(proposal[2].toNumber(), 3);
}

const getAddressByCodeFactory = abis => code => abis.find(abi => abi.code === code).address;

const fund = async (from, to) => from.sendTransaction({ to, value: parseEther('1000') });

const unlock = async address => {
  await ethers.provider.send('hardhat_impersonateAccount', [address]);
  return await ethers.getSigner(address);
};

module.exports = {
  submitGovernanceProposal,
  submitMemberVoteGovernanceProposal,
  Address,
  UserAddress,
  getAddressByCodeFactory,
  fund,
  unlock,
  ratioScale,
};
