const { expect } = require('chai');

describe('changeMaxABCount', function () {
  it('should change max AB count', async function () {
    const { memberRoles } = this.contracts;
    const { governanceContracts } = this.accounts;

    const maxABCountBefore = await memberRoles.maxABCount();
    await memberRoles.connect(governanceContracts[0]).changeMaxABCount(2);
    const maxABCountAfter = await memberRoles.maxABCount();

    expect(maxABCountBefore).not.to.be.eq(maxABCountAfter);
    expect(maxABCountAfter).to.be.eq(2);
  });
  it('should revert if the caller is not authorized to govern', async function () {
    const { memberRoles } = this.contracts;
    const { defaultSender } = this.accounts;

    await expect(memberRoles.connect(defaultSender).changeMaxABCount(2)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });
});
