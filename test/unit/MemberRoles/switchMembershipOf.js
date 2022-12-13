const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('switchMembershipOf', function () {
  it('changes membership to another address', async function () {
    const { cover, memberRoles } = this.contracts;
    const {
      members: [oldMember],
      nonMembers: [newMember],
      defaultSender,
    } = this.accounts;

    await cover.connect(defaultSender).switchMembershipOf(oldMember.address, newMember.address);
    const hasMemberRoleOldMember = await memberRoles.checkRole(oldMember.address, Role.Member);
    const hasMemberRoleNewMember = await memberRoles.checkRole(newMember.address, Role.Member);

    expect(hasMemberRoleOldMember).to.be.equal(false);
    expect(hasMemberRoleNewMember).to.be.equal(true);
  });

  it('should revert if not called by internal contract', async function () {
    const { memberRoles } = this.contracts;
    const {
      members: [oldMember],
      nonMembers: [newMember],
      defaultSender,
    } = this.accounts;

    await expect(
      memberRoles.connect(defaultSender).switchMembershipOf(oldMember.address, newMember.address),
    ).to.be.revertedWith('Caller is not an internal contract');
  });
});
