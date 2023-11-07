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

describe.only('teleportMCR', function () {
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

  it('teleportMCR updates should not work after the 1st December', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const firstOfDecember = 1701388800;
    await setNextBlockTime(firstOfDecember);

    await expect(mcr.teleportMCR()).to.be.revertedWith('MCR: Deadline has passed');
  });
});
