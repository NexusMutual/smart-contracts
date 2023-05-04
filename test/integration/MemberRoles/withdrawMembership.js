const { enrollMember } = require('../utils/enroll');
const { expect } = require('chai');
const { Role } = require('../utils').constants;

describe('withdrawMembership', function () {
  it('withdraws membership for current member', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;

    const [member1, member2] = this.accounts.nonMembers;

    const newMembers = [member1, member2];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
    await enrollMember(this.contracts, newMembers, this.accounts.defaultSender);

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
    const { mr: memberRoles } = this.contracts;
    const [nonMember1] = this.accounts.nonMembers;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });

  it('reverts when withdrawing membership for staking pool manager', async function () {
    const { mr: memberRoles } = this.contracts;
    const [stakingPoolManager] = this.accounts.stakingPoolManagers;
    await expect(memberRoles.connect(stakingPoolManager).withdrawMembership()).to.be.revertedWith(
      'MemberRoles: Member is a staking pool manager',
    );
  });
});
