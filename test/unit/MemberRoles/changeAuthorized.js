const { Role } = require('../utils').constants;
const { expect } = require('chai');

describe('changeAuthorized', function () {
  it('should change authorized address for the role', async function () {
    const { memberRoles } = this.contracts;
    const {
      advisoryBoardMembers: [advisoryBoardMember],
      governanceContracts,
    } = this.accounts;

    const authorizedAddressBefore = await memberRoles.authorized(Role.AdvisoryBoard);
    await memberRoles.connect(governanceContracts[0]).changeAuthorized(Role.AdvisoryBoard, advisoryBoardMember.address);
    const authorizedAddressAfter = await memberRoles.authorized(Role.AdvisoryBoard);

    expect(authorizedAddressBefore).not.to.be.equal(advisoryBoardMember.address);
    expect(authorizedAddressAfter).to.be.equal(advisoryBoardMember.address);

    await expect(
      memberRoles.connect(governanceContracts[0]).changeAuthorized(Role.AdvisoryBoard, governanceContracts[0].address),
    ).to.be.reverted;
    await expect(
      memberRoles.connect(advisoryBoardMember).changeAuthorized(Role.AdvisoryBoard, governanceContracts[0].address),
    ).to.not.be.reverted;
  });

  it('should revert if the caller is not authorized', async function () {
    const { memberRoles } = this.contracts;
    const { defaultSender } = this.accounts;

    await expect(
      memberRoles.connect(defaultSender).changeAuthorized(Role.AdvisoryBoard, defaultSender.address),
    ).to.be.revertedWith('Not Authorized');
  });
});
