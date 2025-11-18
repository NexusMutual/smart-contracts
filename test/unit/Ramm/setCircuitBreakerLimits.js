const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('setCircuitBreakerLimits', function () {
  it('should only be callable by governor', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governor] = fixture.accounts.governanceContracts;

    for (const member of fixture.accounts.members) {
      const setLimits = ramm.connect(member).setCircuitBreakerLimits(0, 0);
      await expect(setLimits).to.be.revertedWithCustomError(ramm, 'Unauthorized');
    }

    const setLimits = ramm.connect(governor).setCircuitBreakerLimits(0, 0);
    await expect(setLimits).to.not.be.reverted;
  });

  it('should successfully set new limits', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governor] = fixture.accounts.governanceContracts;

    const initialEthLimit = await ramm.ethLimit();
    const initialNxmLimit = await ramm.nxmLimit();

    await ramm.connect(governor).setCircuitBreakerLimits(1, 2);

    const finalEthLimit = await ramm.ethLimit();
    const finalNxmLimit = await ramm.nxmLimit();

    expect(initialEthLimit).to.not.equal(finalEthLimit);
    expect(initialNxmLimit).to.not.equal(finalNxmLimit);

    expect(finalEthLimit).to.equal(1);
    expect(finalNxmLimit).to.equal(2);
  });
});
