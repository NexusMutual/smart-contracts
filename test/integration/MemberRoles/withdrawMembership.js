const { enrollMember } = require('../utils/enroll');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { Role } = require('../utils').constants;

describe('withdrawMembership', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('withdraws membership for current member', async function () {
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

  it('reverts when withdrawing membership for non-member', async function () {
    const { mr: memberRoles } = fixture.contracts;
    const [nonMember1] = fixture.accounts.nonMembers;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });

  it('reverts when withdrawing membership for staking pool manager', async function () {
    const { mr: memberRoles } = fixture.contracts;
    const [stakingPoolManager] = fixture.accounts.stakingPoolManagers;
    await expect(memberRoles.connect(stakingPoolManager).withdrawMembership()).to.be.revertedWith(
      'MemberRoles: Member is a staking pool manager',
    );
  });
});
