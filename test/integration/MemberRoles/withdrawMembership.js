const { accounts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { enrollMember } = require('../utils/enroll');
const { Role } = require('../utils').constants;

const [, member1, member2, nonMember1] = accounts;

describe('withdrawMembership', function () {
  it('withdraws membership for current member', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;

    const members = [member1, member2];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);
    await enrollMember(this.contracts, members);

    await memberRoles.withdrawMembership({ from: member1 });
    const hasRole = await memberRoles.checkRole(member1, Role.Member);
    assert(!hasRole);
    const { memberArray } = await memberRoles.members(Role.Member);
    assert.equal(memberArray.length, members.length - 1 + membersBefore.length);

    const whitelisted = await token.whiteListed(member1);
    assert(!whitelisted);
    const balance = await token.balanceOf(member1);
    assert.equal(balance.toString(), '0');
  });

  it('reverts when withdrawing membership for non-member', async function () {
    const { mr: memberRoles } = this.contracts;
    await expectRevert.unspecified(memberRoles.withdrawMembership({ from: nonMember1 }));
  });
});
