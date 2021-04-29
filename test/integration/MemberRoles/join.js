const { accounts } = require('hardhat');
const { enrollMember } = require('../utils/enroll');
const { Role } = require('../utils').constants;

const [, member1, member2, member3] = accounts;
const TOTAL_ROLES = 4;

describe('join', function () {

  it('enrolls members by paying joining fee confirming KYC', async function () {

    const { mr: memberRoles, tk: token } = this.contracts;
    const members = [member1, member2, member3];
    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);

    await enrollMember(this.contracts, members);

    for (const member of members) {
      const hasRole = await memberRoles.checkRole(member, Role.Member);
      assert(hasRole);
      const roles = await memberRoles.roles(member);
      assert.equal(roles.length, TOTAL_ROLES);
      assert.equal(roles[0].toString(), Role.Member.toString());

      for (let i = 1; i < TOTAL_ROLES; i++) {
        assert.equal(roles[i].toString(), '0');
      }

      const whitelisted = await token.whiteListed(member);
      assert(whitelisted);
    }

    const { memberArray } = await memberRoles.members(Role.Member);
    assert.equal(memberArray.length, members.length + membersBefore.length);
  });

  it('returns correct number of roles', async function () {
    const { mr: memberRoles } = this.contracts;
    const totalRoles = await memberRoles.totalRoles();
    assert.equal(totalRoles.toString(), TOTAL_ROLES.toString(), 'Initial member roles not created');
  });

});
