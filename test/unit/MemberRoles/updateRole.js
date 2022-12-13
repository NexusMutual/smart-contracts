const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('updateRole', function () {
  it('should update a role of a member', async function () {
    const { memberRoles } = this.contracts;
    const { advisoryBoardMembers, governanceContracts } = this.accounts;
    const [member] = advisoryBoardMembers;

    await memberRoles.connect(governanceContracts[0]).updateRole(member.address, Role.Member, false);
  });

  it('should revert if role already active', async function () {
    const { memberRoles } = this.contracts;
    const { advisoryBoardMembers, governanceContracts } = this.accounts;
    const [member] = advisoryBoardMembers;

    await expect(memberRoles.connect(governanceContracts[0]).updateRole(member.address, Role.Member, true)).to.be
      .reverted;
  });
  it('should revert if role already inactive', async function () {
    const { memberRoles } = this.contracts;
    const { advisoryBoardMembers, governanceContracts } = this.accounts;
    const [member] = advisoryBoardMembers;

    await memberRoles.connect(governanceContracts[0]).updateRole(member.address, Role.Member, false);
    await expect(memberRoles.connect(governanceContracts[0]).updateRole(member.address, Role.Member, false)).to.be
      .reverted;
  });
});
