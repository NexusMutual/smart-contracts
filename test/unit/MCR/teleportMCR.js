const { expect } = require('chai');
const { initMCR } = require('./common');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { setNextBlockTime } = require('../utils').evm;

const { parseEther } = ethers.utils;

const DEFAULT_MCR_PARAMS = {
  mcrValue: parseEther('150000'),
  mcrFloor: parseEther('150000'),
  desiredMCR: parseEther('150000'),
  mcrFloorIncrementThreshold: '13000',
  maxMCRFloorIncrement: '100',
  maxMCRIncrement: '500',
  gearingFactor: '48000',
  minUpdateTime: '3600',
};

describe('teleportMCR', function () {
  it('teleportMCR updates values accordingly', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const nextUpdateTime = currentTimestamp + 1;
    await setNextBlockTime(nextUpdateTime);
    await mcr.teleportMCR();

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const presetMCR = parseEther('10000');
    expect(storedMCR).to.be.equal(presetMCR);
    expect(desiredMCR).to.be.equal(presetMCR);
    expect(lastUpdateTime).to.be.equal(nextUpdateTime);
  });

  it('teleportMCR updates only once', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    // first one should pass
    await mcr.teleportMCR();

    // second one should fail
    await expect(mcr.teleportMCR()).to.be.revertedWith('MCR: already updated');
  });

  it('teleportMCR updates should not work after the deadline', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const mcrUpdateDeadline = await mcr.MCR_UPDATE_DEADLINE();
    await setNextBlockTime(mcrUpdateDeadline.toNumber());

    await expect(mcr.teleportMCR()).to.be.revertedWith('MCR: Deadline has passed');
  });

  it('teleportMCR cannot be called before the upgrade actually happened', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const { mcrValue, desiredMCR, maxMCRIncrement, gearingFactor, minUpdateTime } = DEFAULT_MCR_PARAMS;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

    const DisposableMCR = await ethers.getContractFactory('DisposableMCR');
    const MCR = await ethers.getContractFactory('MCR');

    // deploy disposable mcr and initialize values
    const disposableMCR = await DisposableMCR.deploy(
      mcrValue,
      desiredMCR,
      currentTime,
      maxMCRIncrement,
      gearingFactor,
      minUpdateTime,
    );

    const block = await ethers.provider.getBlock('latest');
    const mcrUpdateDeadline = block.timestamp + 30 * 24 * 3600;

    // deploy mcr with fake master
    const mcr = await MCR.deploy(disposableMCR.address, mcrUpdateDeadline);

    await expect(mcr.teleportMCR()).to.be.revertedWith('MCR: not yet initialized');

    // trigger initialize and switch master address
    await disposableMCR.initializeNextMcr(mcr.address, master.address);

    // should not revert
    await mcr.teleportMCR();
  });
});
