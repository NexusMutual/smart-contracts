const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('setEmergencySwapPause', function () {
  it('should only be callable by emergencyAdmin', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const { emergencyAdmin } = fixture.accounts;

    for (const member of fixture.accounts.members) {
      const setSwapPaused = ramm.connect(member).setEmergencySwapPause(true);
      await expect(setSwapPaused).to.be.revertedWith('Caller is not emergency admin');
    }

    const setSwapPaused = ramm.connect(emergencyAdmin).setEmergencySwapPause(true);
    await expect(setSwapPaused).to.not.be.revertedWith('Caller is not emergency admin');
  });

  it('should successfully toggle swapPaused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const { emergencyAdmin } = fixture.accounts;

    expect(await ramm.swapPaused()).to.be.equal(false);

    await ramm.connect(emergencyAdmin).setEmergencySwapPause(true);
    expect(await ramm.swapPaused()).to.be.equal(true);

    await ramm.connect(emergencyAdmin).setEmergencySwapPause(false);
    expect(await ramm.swapPaused()).to.be.equal(false);
  });

  it('should emit SwapPauseConfigured', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const { emergencyAdmin } = fixture.accounts;

    const swapPausedTrue = ramm.connect(emergencyAdmin).setEmergencySwapPause(true);
    await expect(swapPausedTrue).to.emit(ramm, 'SwapPauseConfigured').withArgs(true);

    const swapPausedFalse = ramm.connect(emergencyAdmin).setEmergencySwapPause(false);
    await expect(swapPausedFalse).to.emit(ramm, 'SwapPauseConfigured').withArgs(false);
  });
});
