const { enrollMember } = require('../utils/enroll');
const { Role } = require('../utils').constants;
const { expect } = require('chai');

const TOTAL_ROLES = 4;

describe('join', function () {
  it('enrolls members by paying joining fee confirming KYC', async function () {
    const { mr: memberRoles, tk: token } = this.contracts;

    const [member1, member2, member3] = this.accounts.nonMembers;
    const newMembers = [member1, member2, member3];

    const { memberArray: membersBefore } = await memberRoles.members(Role.Member);

    await enrollMember(this.contracts, newMembers, this.accounts.defaultSender);

    for (const member of newMembers) {
      const hasRole = await memberRoles.checkRole(member.address, Role.Member);
      expect(hasRole).to.be.equal(true);
      const roles = await memberRoles.roles(member.address);
      expect(roles.length).to.be.equal(TOTAL_ROLES);
      expect(roles[0]).to.be.equal(Role.Member);

      for (let i = 1; i < TOTAL_ROLES; i++) {
        expect(roles[i]).to.be.equal(0);
      }

      const whitelisted = await token.whiteListed(member.address);
      expect(whitelisted).to.be.equal(true);
    }

    const { memberArray } = await memberRoles.members(Role.Member);
    expect(memberArray.length).to.be.equal(newMembers.length + membersBefore.length);
  });

  it('returns correct number of roles', async function () {
    const { mr: memberRoles } = this.contracts;
    const totalRoles = await memberRoles.totalRoles();
    expect(totalRoles).to.be.equal(TOTAL_ROLES);
  });
});
