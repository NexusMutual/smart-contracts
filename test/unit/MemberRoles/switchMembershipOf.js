const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('switchMembershipOf', function () {
  it('changes membership to another address', async function () {
    const { master, memberRoles } = this.contracts;
    const [oldMember] = this.accounts.members;
    const [newMember] = this.accounts.nonMembers;
    const [internalContract] = this.accounts.internalContracts;

    expect(await memberRoles.checkRole(oldMember.address, Role.Member)).to.be.equal(true);
    expect(await memberRoles.checkRole(newMember.address, Role.Member)).to.be.equal(false);

    await master.enrollInternal(internalContract.address);
    await memberRoles.connect(internalContract).switchMembershipOf(oldMember.address, newMember.address);

    expect(await memberRoles.checkRole(oldMember.address, Role.Member)).to.be.equal(false);
    expect(await memberRoles.checkRole(newMember.address, Role.Member)).to.be.equal(true);
  });

  it('should revert if not called by internal contract', async function () {
    const { memberRoles } = this.contracts;
    const [oldMember] = this.accounts.members;
    const [newMember] = this.accounts.nonMembers;

    await expect(memberRoles.switchMembershipOf(oldMember.address, newMember.address)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });
});
