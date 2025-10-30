const { Role } = require('../utils').constants;
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('switchMembershipOf', function () {
  it('changes membership to another address', async function () {
    const fixture = await loadFixture(setup);
    const { master, memberRoles } = fixture.contracts;
    const [oldMember] = fixture.accounts.members;
    const [newMember] = fixture.accounts.nonMembers;
    const [internalContract] = fixture.accounts.internalContracts;

    expect(await memberRoles.checkRole(oldMember.address, Role.Member)).to.be.equal(true);
    expect(await memberRoles.checkRole(newMember.address, Role.Member)).to.be.equal(false);

    await master.enrollInternal(internalContract.address);
    await memberRoles.connect(internalContract).switchMembershipOf(oldMember.address, newMember.address);

    expect(await memberRoles.checkRole(oldMember.address, Role.Member)).to.be.equal(false);
    expect(await memberRoles.checkRole(newMember.address, Role.Member)).to.be.equal(true);
  });

  it('should revert if not called by internal contract', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const [oldMember] = fixture.accounts.members;
    const [newMember] = fixture.accounts.nonMembers;

    await expect(memberRoles.switchMembershipOf(oldMember.address, newMember.address)).to.be.revertedWith(
      'Caller is not an internal contract',
    );
  });
});
