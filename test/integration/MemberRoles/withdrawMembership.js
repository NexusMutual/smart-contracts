const { enrollMember } = require('../utils/enroll');
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
    assert(!hasRole);
    const { memberArray } = await memberRoles.members(Role.Member);
    assert.equal(memberArray.length, newMembers.length - 1 + membersBefore.length);

    const whitelisted = await token.whiteListed(member1.address);
    assert(!whitelisted);
    const balance = await token.balanceOf(member1.address);
    assert.equal(balance.toString(), '0');
  });

  it('reverts when withdrawing membership for non-member', async function () {
    const { mr: memberRoles } = this.contracts;
    const [nonMember1] = this.accounts.nonMembers;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });
});
