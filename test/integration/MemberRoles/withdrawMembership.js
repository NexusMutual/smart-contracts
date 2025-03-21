const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { enrollMember } = require('../utils/enroll');
const { Role } = require('../utils').constants;
const { setNextBlockTime } = require('../utils').evm;
const setup = require('../setup');

describe('withdrawMembership', function () {
  it('withdraws membership for current member', async function () {
    const fixture = await loadFixture(setup);
    const { mr: memberRoles, tk: token } = fixture.contracts;

    const [member1, member2] = fixture.accounts.nonMembers;

    const newMembers = [member1, member2];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
    await enrollMember(fixture.contracts, newMembers, fixture.accounts.defaultSender);

    await memberRoles.connect(member1).withdrawMembership();
    const hasRole = await memberRoles.checkRole(member1.address, Role.Member);
    expect(hasRole).to.be.equal(false);
    const { memberArray } = await memberRoles.members(Role.Member);
    expect(memberArray.length).to.be.equal(newMembers.length - 1 + membersBefore.length);

    const whitelisted = await token.whiteListed(member1.address);
    expect(whitelisted).to.be.equal(false);
    const balance = await token.balanceOf(member1.address);
    expect(balance).to.be.equal(0);
  });

  it("emits MembershipWithdrawn event with the withdrawn member's address and timestamp", async function () {
    const fixture = await loadFixture(setup);
    const { mr: memberRoles } = fixture.contracts;
    const [member1] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(timestamp + 1);

    await expect(memberRoles.connect(member1).withdrawMembership())
      .to.emit(memberRoles, 'MembershipWithdrawn')
      .withArgs(member1.address, timestamp + 1);
  });

  it('reverts when withdrawing membership for non-member', async function () {
    const fixture = await loadFixture(setup);
    const { mr: memberRoles } = fixture.contracts;
    const [nonMember1] = fixture.accounts.nonMembers;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });

  it('reverts when withdrawing membership for staking pool manager', async function () {
    const fixture = await loadFixture(setup);
    const { mr: memberRoles } = fixture.contracts;
    const [stakingPoolManager] = fixture.accounts.stakingPoolManagers;
    await expect(memberRoles.connect(stakingPoolManager).withdrawMembership()).to.be.revertedWithCustomError(
      memberRoles,
      'CantBeStakingPoolManager',
    );
  });
});
