const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('changeMaxABCount', function () {
  const newMaxABCount = 2;

  it('should change max AB count', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { governanceContracts } = fixture.accounts;

    const maxABCountBefore = await memberRoles.maxABCount();
    await memberRoles.connect(governanceContracts[0]).changeMaxABCount(newMaxABCount);
    const maxABCountAfter = await memberRoles.maxABCount();

    expect(maxABCountBefore).not.to.be.eq(maxABCountAfter);
    expect(maxABCountAfter).to.be.eq(newMaxABCount);
  });

  it('should revert if the caller is not authorized to govern', async function () {
    const fixture = await loadFixture(setup);
    const { memberRoles } = fixture.contracts;
    const { defaultSender } = fixture.accounts;

    await expect(memberRoles.connect(defaultSender).changeMaxABCount(newMaxABCount)).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });
});
