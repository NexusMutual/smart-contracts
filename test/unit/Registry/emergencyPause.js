const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

const { ZeroAddress } = ethers;
const PAUSE_EVERYTHING = 2n ** 48n - 1n;
const PAUSE_SWAPS = 1n << 1n; // 0b010 = 2

const epFixture = async () => {
  const setupFixture = await loadFixture(setup);
  const { registry, alice, bob, governor } = setupFixture;

  await registry.connect(governor).setEmergencyAdmin(alice, true);
  await registry.connect(governor).setEmergencyAdmin(bob, true);

  return setupFixture;
};

describe('emergencyPause', () => {
  it('should not allow non-governor addresses to add emergency admins', async () => {
    const { registry, alice, bob, mallory } = await loadFixture(epFixture);

    await expect(registry.connect(alice).setEmergencyAdmin(alice, true)) // as emergency admin
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');

    await expect(registry.connect(bob).setEmergencyAdmin(mallory, true)) // as random user
      .to.be.revertedWithCustomError(registry, 'OnlyGovernor');
  });

  it('should not allow a non-emergency admin to propose a pause config', async () => {
    const { registry, mallory } = await loadFixture(epFixture);
    const config = 1;

    await expect(registry.connect(mallory).proposePauseConfig(config)) // propose
      .to.be.revertedWithCustomError(registry, 'OnlyEmergencyAdmin');
  });

  it('should not allow a non-emergency admin to confirm a pause config', async () => {
    const { registry, mallory } = await loadFixture(epFixture);
    const config = 1;

    await expect(registry.connect(mallory).confirmPauseConfig(config)) // confirm
      .to.be.revertedWithCustomError(registry, 'OnlyEmergencyAdmin');
  });

  it('should revert when the proposed config is greater than 2^48 - 1', async () => {
    const { registry, alice } = await loadFixture(epFixture);
    const config = 2n ** 48n;
    await expect(registry.connect(alice).proposePauseConfig(config)) // propose
      .to.be.revertedWith("SafeCast: value doesn't fit in 48 bits");
  });

  it('should revert when confirming a pause config that is not the proposed config', async () => {
    const { registry, alice, bob } = await loadFixture(epFixture);
    const proposedConfig = 0b001; // PAUSE_GLOBAL
    const confirmingConfig = 0b011; // PAUSE_GLOBAL + PAUSE_SWAPS

    await registry.connect(alice).proposePauseConfig(proposedConfig); // propose

    await expect(registry.connect(bob).confirmPauseConfig(confirmingConfig)) // confirm
      .to.be.revertedWithCustomError(registry, 'PauseConfigMismatch');
  });

  it('should revert when proposer tries to confirm their own proposed config', async () => {
    const { registry, alice } = await loadFixture(epFixture);
    await registry.connect(alice).proposePauseConfig(PAUSE_EVERYTHING); // propose
    await expect(registry.connect(alice).confirmPauseConfig(PAUSE_EVERYTHING)) // confirm
      .to.be.revertedWithCustomError(registry, 'ProposerCannotConfirmPause');
  });

  it('should revert when confirming a pause config that has not been proposed', async () => {
    const { registry, bob } = await loadFixture(epFixture);
    await expect(registry.connect(bob).confirmPauseConfig(0)) // confirm
      .to.be.revertedWithCustomError(registry, 'NoConfigProposed');
  });

  it('should be able to unpause the system', async () => {
    const { registry, alice, bob } = await loadFixture(epFixture);
    await registry.connect(alice).proposePauseConfig(PAUSE_EVERYTHING); // propose pause
    await registry.connect(bob).confirmPauseConfig(PAUSE_EVERYTHING); // confirm
    await registry.connect(alice).proposePauseConfig(0); // propose unpause
    await registry.connect(bob).confirmPauseConfig(0); // confirm
  });

  it('should allow overwriting a proposed config', async () => {
    const { registry, alice, bob } = await loadFixture(epFixture);
    await registry.connect(alice).proposePauseConfig(PAUSE_EVERYTHING); // pause everything
    await registry.connect(alice).proposePauseConfig(PAUSE_SWAPS); // only pause swaps

    const proposed = await registry.getSystemPause();
    expect(proposed.config).to.equal(0);
    expect(proposed.proposedConfig).to.equal(PAUSE_SWAPS);
    expect(proposed.proposer).to.equal(alice);

    await registry.connect(bob).confirmPauseConfig(PAUSE_SWAPS); // confirm

    const confirmed = await registry.getSystemPause();
    expect(confirmed.config).to.equal(PAUSE_SWAPS);
    expect(confirmed.proposedConfig).to.equal(0);
    expect(confirmed.proposer).to.equal(ZeroAddress);
  });

  it('should set the desired pause configuration', async () => {
    const { registry, alice, bob } = await loadFixture(epFixture);

    const initialConfig = await registry.getPauseConfig();
    expect(initialConfig).to.equal(0);

    await expect(registry.connect(alice).proposePauseConfig(PAUSE_EVERYTHING)) // propose
      .to.emit(registry, 'PauseConfigProposed')
      .withArgs(PAUSE_EVERYTHING, alice);

    const proposedConfig = await registry.getSystemPause();
    expect(proposedConfig.proposedConfig).to.equal(PAUSE_EVERYTHING);
    expect(proposedConfig.proposer).to.equal(alice.address);

    await expect(registry.connect(bob).confirmPauseConfig(PAUSE_EVERYTHING)) // confirm
      .to.emit(registry, 'PauseConfigConfirmed')
      .withArgs(PAUSE_EVERYTHING, bob);

    const confirmedConfig = await registry.getPauseConfig();
    const pause = await registry.getSystemPause();

    expect(confirmedConfig).to.equal(PAUSE_EVERYTHING);
    expect(pause.config).to.equal(PAUSE_EVERYTHING);
    expect(pause.proposedConfig).to.equal(0);
    expect(pause.proposer).to.equal(ZeroAddress);
  });
});
