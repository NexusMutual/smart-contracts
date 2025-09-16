const { expect } = require('chai');
const { initMCR } = require('./common');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { increaseTime, mineNextBlock, setEtherBalance } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

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

describe('updateMCR', function () {
  it('does not update if minUpdateTime has not passed', async function () {
    const fixture = await loadFixture(setup);
    const { master, pool } = fixture;

    const poolValueInEth = parseEther('200000');
    await setEtherBalance(pool.address, poolValueInEth);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const previousLastUpdateTime = await mcr.lastUpdateTime();
    await mcr.updateMCR();

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(DEFAULT_MCR_PARAMS.desiredMCR);
    expect(lastUpdateTime).to.be.equal(previousLastUpdateTime);
  });

  it('increases desiredMCR when mcrWithGear exceeds current MCR', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover, pool } = fixture;

    await setEtherBalance(pool.address, parseEther('160000'));
    await cover.setTotalActiveCoverInAsset(0, parseEther('800000'));

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);
    await mineNextBlock();

    await mcr.updateMCR();

    const currentBlock = await ethers.provider.getBlockNumber();
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const totalSumAssured = await mcr.getTotalActiveCoverAmount();
    const gearingFactor = await mcr.gearingFactor();
    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);

    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(expectedDesiredMCR);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases desiredMCR when mcrWithGear increase', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover, pool } = fixture;

    const poolValueInEth = DEFAULT_MCR_PARAMS.mcrValue.mul(131).div(100);
    await setEtherBalance(pool.address, poolValueInEth);

    const totalSumAssured = parseEther('800000');
    await cover.setTotalActiveCoverInAsset(0, totalSumAssured);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const gearingFactor = (await mcr.gearingFactor()).toString();

    await increaseTime(daysToSeconds(1));
    await mineNextBlock();
    const desiredMCRBefore = await mcr.desiredMCR();

    await mcr.updateMCR();

    const currentBlock = await ethers.provider.getBlockNumber();
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;

    const storedMCR = await mcr.mcr();
    const desiredMCRAfter = await mcr.desiredMCR();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);
    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCRAfter).to.be.greaterThan(desiredMCRBefore);
    expect(desiredMCRAfter).to.be.equal(expectedDesiredMCR);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases/decreases desiredMCR when mcrWithGear increases/decreases', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover, pool } = fixture;

    const poolValueInEth = parseEther('160000');
    await setEtherBalance(pool.address, poolValueInEth);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const gearingFactor = await mcr.gearingFactor();
    const minUpdateTime = await mcr.minUpdateTime();

    {
      const totalSumAssured = parseEther('900000');
      await cover.setTotalActiveCoverInAsset(0, totalSumAssured);

      await increaseTime(minUpdateTime + 1);
      await mineNextBlock();

      await mcr.updateMCR();
      const storedMCR = await mcr.mcr();
      const desiredMCR = await mcr.desiredMCR();
      const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);

      expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
      expect(desiredMCR).to.be.equal(expectedDesiredMCR);
    }

    {
      const totalSumAssured = parseEther('800000');
      await cover.setTotalActiveCoverInAsset(0, totalSumAssured);

      await increaseTime(minUpdateTime + 1);
      await mineNextBlock();

      await mcr.updateMCR();
      const desiredMCR = await mcr.desiredMCR();
      const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);
      expect(desiredMCR).to.be.equal(expectedDesiredMCR);
    }
  });

  it('increases desiredMCR when mcrWithGear exceeds current MCR if MCR% < 100%', async function () {
    const fixture = await loadFixture(setup);
    const { master, cover, pool } = fixture;
    await setEtherBalance(pool.address, parseEther('120000'));
    await cover.setTotalActiveCoverInAsset(0, parseEther('800000'));

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);
    await mineNextBlock();

    await mcr.updateMCR();

    const desiredMCR = await mcr.desiredMCR();
    const totalSumAssured = await mcr.getTotalActiveCoverAmount();
    const gearingFactor = await mcr.gearingFactor();
    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);
    expect(desiredMCR).to.be.equal(expectedDesiredMCR);
  });
});
