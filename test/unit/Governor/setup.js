const { ethers, nexus } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { init } = require('../../init');

const { ContractIndexes } = nexus.constants;
const { parseEther } = ethers;

const assignRoles = accounts => ({
  defaultSender: accounts[0],
  nonMembers: accounts.slice(1, 5),
  members: accounts.slice(5, 10),
  advisoryBoardMembers: accounts.slice(10, 15),
  stakingPoolManagers: accounts.slice(15, 25),
  emergencyAdmins: accounts.slice(25, 30),
  generalPurpose: accounts.slice(30, 35),
});

async function setup() {
  await loadFixture(init);
  const accounts = assignRoles(await ethers.getSigners());
  const registry = await ethers.deployContract('GVMockRegistry', []);
  const tokenController = await ethers.deployContract('GVMockTokenController', []);
  await registry.addContract(ContractIndexes.C_TOKEN_CONTROLLER, tokenController, true);

  const governor = await ethers.deployContract('Governor', [registry]);
  await registry.addContract(ContractIndexes.C_GOVERNOR, governor, false);

  await Promise.all(
    accounts.members.map(member => {
      return registry.setMember(member.address);
    }),
  );

  await Promise.all(
    accounts.advisoryBoardMembers.map(member => {
      return registry.setMember(member.address);
    }),
  );

  await Promise.all(
    [...accounts.advisoryBoardMembers].map((member, index) => {
      return registry.setAdvisoryBoardMember(member.address, index + 1);
    }),
  );

  async function createABProposal(txs = []) {
    const [abMember] = accounts.advisoryBoardMembers;

    if (txs.length === 0) {
      txs = [{ target: ethers.ZeroAddress, value: 0, data: '0x' }];
    }

    await governor.connect(abMember).propose(txs, 'Test Proposal');
    return await governor.proposalCount();
  }

  async function createMemberProposal() {
    const [member] = accounts.members;
    const [abMember] = accounts.advisoryBoardMembers;

    const memberId = await registry.memberIds(member);
    const abMemberId = await registry.memberIds(abMember);
    const swaps = [{ from: abMemberId, to: memberId }];

    const thresholdBalance = parseEther('200');
    const totalSupply = parseEther('1000000'); // 1m

    await tokenController.setTotalBalanceOf(member, thresholdBalance);
    await tokenController.setTotalSupply(totalSupply);

    await governor.connect(member).proposeAdvisoryBoardSwap(swaps, 'Member Proposal');

    return await governor.proposalCount();
  }

  const TIMELOCK_PERIOD = await governor.TIMELOCK_PERIOD();
  const VOTING_PERIOD = await governor.VOTING_PERIOD();
  const ADVISORY_BOARD_THRESHOLD = await governor.ADVISORY_BOARD_THRESHOLD();
  const MEMBER_VOTE_QUORUM_PERCENTAGE = await governor.MEMBER_VOTE_QUORUM_PERCENTAGE();
  const PROPOSAL_THRESHOLD = await governor.PROPOSAL_THRESHOLD();

  const constants = {
    TIMELOCK_PERIOD,
    VOTING_PERIOD,
    ADVISORY_BOARD_THRESHOLD,
    MEMBER_VOTE_QUORUM_PERCENTAGE,
    PROPOSAL_THRESHOLD,
  };

  return {
    accounts,
    governor,
    registry,
    tokenController,
    createABProposal,
    createMemberProposal,
    constants,
  };
}

module.exports = setup;
