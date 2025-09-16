const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { Role } = require('../utils').constants;
const { setNextBlockTime } = require('../utils').evm;

const { formatBytes32String } = ethers.utils;

describe('withdrawMembership', function () {
  it('reverts when withdrawing membership for non-member', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      nonMembers: [nonMember1],
    } = fixture.accounts;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });

  it('reverts when token is locked', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await nxm.setLock(member.address, 1000);
    await expect(memberRoles.connect(member).withdrawMembership()).to.be.reverted;
  });

  it('reverts when member has tokens locked for claim assessment', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await tokenController.setTokensLocked(member.address, formatBytes32String('CLA'), 100);
    await expect(memberRoles.connect(member).withdrawMembership()).to.be.revertedWithCustomError(
      memberRoles,
      'HasNXMStakedInClaimAssessmentV1',
    );
  });

  it('reverts when member has tokens staked for assessment', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, assessment } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await assessment.setStakeOf(member.address, 100);
    await expect(memberRoles.connect(member).withdrawMembership()).to.be.revertedWithCustomError(
      memberRoles,
      'MemberHasAssessmentStake',
    );
  });

  it('reverts when member has pending rewards in TokenController', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await tokenController.setPendingRewards(member.address, 100);
    await expect(memberRoles.connect(member).withdrawMembership()).to.be.revertedWithCustomError(
      memberRoles,
      'MemberHasPendingRewardsInTokenController',
    );
  });

  it("removes member's the address from the whitelist", async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    await tokenController.setIsStakingPoolManager(member1.address, false);
    await memberRoles.connect(member1).withdrawMembership();

    const removeFromWhitelistLastCalledWtih = await tokenController.removeFromWhitelistLastCalledWtih();
    expect(removeFromWhitelistLastCalledWtih).to.be.equal(member1.address);
  });

  it('prevents withdrawing membership if the member is a staking pool manager', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, tokenController } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    await tokenController.setIsStakingPoolManager(member1.address, true);

    await expect(memberRoles.connect(member1).withdrawMembership()).to.be.revertedWithCustomError(
      memberRoles,
      'CantBeStakingPoolManager',
    );
  });

  it("burns all the tokens from the member's address", async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles, nxm } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    const balanceBefore = await nxm.balanceOf(member1.address);
    await memberRoles.connect(member1).withdrawMembership();
    const balanceAfter = await nxm.balanceOf(member1.address);

    expect(balanceBefore).to.be.gt(0);
    expect(balanceAfter).to.be.equal(0);
  });

  it('decreases the members count', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    const membersBefore = await memberRoles.numberOfMembers(Role.Member);
    await memberRoles.connect(member1).withdrawMembership();
    const membersAfter = await memberRoles.numberOfMembers(Role.Member);
    expect(membersAfter).to.be.equal(membersBefore - 1);
  });

  it("removes the role of member from the member's address", async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    const hadMemberRoleBefore = await memberRoles.checkRole(member1.address, Role.Member);
    await memberRoles.connect(member1).withdrawMembership();
    const hasMemberRoleAfter = await memberRoles.checkRole(member1.address, Role.Member);
    expect(hadMemberRoleBefore).to.be.equal(true);
    expect(hasMemberRoleAfter).to.be.equal(false);
  });

  it("emits MembershipWithdrawn event with the withdrawn member's address and timestamp", async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const {
      members: [member1],
    } = fixture.accounts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(timestamp + 1);

    await expect(memberRoles.connect(member1).withdrawMembership())
      .to.emit(memberRoles, 'MembershipWithdrawn')
      .withArgs(member1.address, timestamp + 1);
  });
});
