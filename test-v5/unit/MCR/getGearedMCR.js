const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { initMCR } = require('./common');
const { increaseTime, mineNextBlock } = require('../utils').evm;
const { hoursToSeconds } = require('../utils').helpers;

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

describe('getGearedMCR', function () {
  it('should return gearedMCR = 0 if there are no active covers', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover } = fixture;

    await cover.setTotalActiveCoverInAsset(0, '0'); // ETH

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    await increaseTime(hoursToSeconds(2));
    await mineNextBlock();

    const gearedMCR = await mcr.getGearedMCR();
    expect(gearedMCR).to.be.equal('0');
  });

  it('should return correct geared MCR value', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover } = fixture;

    const GEARING_FACTOR = 48000;
    const BASIS_PRECISION = 10000;
    const activeCoverAmount = parseEther('10000');

    await cover.setTotalActiveCoverInAsset(0, activeCoverAmount); // ETH
    await cover.setTotalActiveCoverInAsset(1, '0'); // DAI

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    await increaseTime(hoursToSeconds(2));
    await mineNextBlock();

    const expectedGearedMCR = activeCoverAmount.mul(BASIS_PRECISION).div(GEARING_FACTOR);
    const gearedMCR = await mcr.getGearedMCR();
    expect(gearedMCR).to.be.equal(expectedGearedMCR);
  });
});
