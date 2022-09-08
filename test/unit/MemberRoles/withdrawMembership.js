const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('withdrawMembership', function () {
  it('reverts when withdrawing membership for non-member', async function () {
    const { memberRoles } = this.contracts;
    const {
      nonMembers: [nonMember1],
    } = this.accounts;
    await expect(memberRoles.connect(nonMember1).withdrawMembership()).to.be.reverted;
  });

  it("removes member's the adress from the whitelist", async function () {
    const { memberRoles, tokenController } = this.contracts;
    const {
      members: [member1],
    } = this.accounts;

    await memberRoles.connect(member1).withdrawMembership();
    const removeFromWhitelistLastCalledWtih = await tokenController.removeFromWhitelistLastCalledWtih();
    expect(removeFromWhitelistLastCalledWtih).to.be.equal(member1.address);
  });

  it("burns all the tokens from the member's address", async function () {
    const { memberRoles, nxm } = this.contracts;
    const {
      members: [member1],
    } = this.accounts;

    const balanceBefore = await nxm.balanceOf(member1.address);
    await memberRoles.connect(member1).withdrawMembership();
    const balanceAfter = await nxm.balanceOf(member1.address);

    expect(balanceBefore).to.be.gt(0);
    expect(balanceAfter).to.be.equal(0);
  });

  it('decreases the members count', async function () {
    const { memberRoles } = this.contracts;
    const {
      members: [member1],
    } = this.accounts;

    const membersBefore = await memberRoles.numberOfMembers(Role.Member);
    await memberRoles.connect(member1).withdrawMembership();
    const membersAfter = await memberRoles.numberOfMembers(Role.Member);
    expect(membersAfter).to.be.equal(membersBefore - 1);
  });

  it("removes the role of member from the mebmber's address", async function () {
    const { memberRoles } = this.contracts;
    const {
      members: [member1],
    } = this.accounts;

    const hadMemberRoleBefore = await memberRoles.checkRole(member1.address, Role.Member);
    await memberRoles.connect(member1).withdrawMembership();
    const hasMemberRoleAfter = await memberRoles.checkRole(member1.address, Role.Member);
    expect(hadMemberRoleBefore).to.be.equal(true);
    expect(hasMemberRoleAfter).to.be.equal(false);
  });
});
