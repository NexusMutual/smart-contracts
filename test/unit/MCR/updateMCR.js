const { expect } = require('chai');
const { initMCR } = require('./common');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { increaseTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds } = require('../utils').helpers;

const { BigNumber } = ethers;
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

const ratioScale = BigNumber.from('10000');

describe('updateMCR', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('does not update if minUpdateTime has not passed', async function () {
    const { master, pool } = fixture;

    const poolValueInEth = parseEther('200000');
    await pool.setPoolValueInEth(poolValueInEth);

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

  it('keeps values the same if MCR = MCR floor and mcrWithGear is too low', async function () {
    const { master, cover, pool } = fixture;

    await pool.setPoolValueInEth(parseEther('160000'));
    await cover.setTotalActiveCoverInAsset(0, '100000');

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

    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(DEFAULT_MCR_PARAMS.desiredMCR);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases desiredMCR when mcrWithGear exceeds current MCR', async function () {
    const { master, cover, pool } = fixture;

    await pool.setPoolValueInEth(parseEther('160000'));
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

    const totalSumAssured = await mcr.getAllSumAssurance();
    const gearingFactor = await mcr.gearingFactor();
    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);

    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(expectedDesiredMCR);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases desiredMCR when mcrFloor increases (MCR% > 130%)', async function () {
    const { master, cover, pool } = fixture;

    const poolValueInEth = DEFAULT_MCR_PARAMS.mcrValue.mul(131).div(100);
    await pool.setPoolValueInEth(poolValueInEth);
    await cover.setTotalActiveCoverInAsset(0, parseEther('100000'));

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    await increaseTime(daysToSeconds(1));
    await mineNextBlock();

    await mcr.updateMCR();

    const currentBlock = await ethers.provider.getBlockNumber();
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const mcrFloor = await mcr.mcrFloor();
    const lastUpdateTime = await mcr.lastUpdateTime();
    const expectedMCRFloor = DEFAULT_MCR_PARAMS.mcrFloor.mul(101).div(100);

    expect(mcrFloor).to.be.equal(expectedMCRFloor);
    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(mcrFloor);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases desiredMCR when both mcrFloor and mcrWithGear increase', async function () {
    const { master, cover, pool } = fixture;

    const poolValueInEth = DEFAULT_MCR_PARAMS.mcrValue.mul(131).div(100);
    await pool.setPoolValueInEth(poolValueInEth);

    const totalSumAssured = parseEther('800000');
    await cover.setTotalActiveCoverInAsset(0, totalSumAssured);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const gearingFactor = (await mcr.gearingFactor()).toString();

    await increaseTime(daysToSeconds(1));
    await mineNextBlock();

    await mcr.updateMCR();

    const currentBlock = await ethers.provider.getBlockNumber();
    const blockTimestamp = (await ethers.provider.getBlock(currentBlock)).timestamp;

    const storedMCR = await mcr.mcr();
    const desiredMCR = await mcr.desiredMCR();
    const mcrFloor = await mcr.mcrFloor();
    const lastUpdateTime = await mcr.lastUpdateTime();

    const expectedMCRFloor = DEFAULT_MCR_PARAMS.mcrFloor.mul(101).div(100);
    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);
    expect(mcrFloor).to.be.equal(expectedMCRFloor);
    expect(storedMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrValue);
    expect(desiredMCR).to.be.equal(expectedDesiredMCR);
    expect(lastUpdateTime).to.be.equal(blockTimestamp);
  });

  it('increases/decreases desiredMCR when mcrWithGear increases/decreases', async function () {
    const { master, cover, pool } = fixture;

    const poolValueInEth = parseEther('160000');
    await pool.setPoolValueInEth(poolValueInEth);

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

  it('increases desiredMCR when mcrWithGear increases and then decreases down to mcrFloor', async function () {
    const { master, cover, pool } = fixture;

    const poolValueInEth = parseEther('160000');
    await pool.setPoolValueInEth(poolValueInEth);

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
      const totalSumAssured = parseEther('700000');
      await cover.setTotalActiveCoverInAsset(0, totalSumAssured);

      await increaseTime(minUpdateTime + 1);
      await mineNextBlock();

      await mcr.updateMCR();
      const desiredMCR = await mcr.desiredMCR();
      expect(desiredMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrFloor);
    }
  });

  it('increases mcrFloor by 1% after 2 days pass', async function () {
    const { master, pool } = fixture;

    const poolValueInEth = parseEther('200000');
    await pool.setPoolValueInEth(poolValueInEth);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();
    const previousMCRFloor = await mcr.mcrFloor();

    await increaseTime(daysToSeconds(2));
    await mineNextBlock();

    await mcr.updateMCR();

    const currentMCRFloor = await mcr.mcrFloor();
    const expectedMCRFloor = previousMCRFloor.mul(ratioScale.add(maxMCRFloorIncrement)).div(ratioScale);
    expect(currentMCRFloor).to.be.equal(expectedMCRFloor);
  });

  it('increases mcrFloor by 1% on multiple updates that are 2 days apart', async function () {
    const { master, pool } = fixture;

    const poolValueInEth = parseEther('200000');
    await pool.setPoolValueInEth(poolValueInEth);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const maxMCRFloorIncrement = await mcr.maxMCRFloorIncrement();
    {
      const previousMCRFloor = await mcr.mcrFloor();

      await increaseTime(daysToSeconds(2));
      await mineNextBlock();

      await mcr.updateMCR();

      const currentMCRFloor = await mcr.mcrFloor();
      const expectedMCRFloor = previousMCRFloor.mul(ratioScale.add(maxMCRFloorIncrement)).div(ratioScale);
      expect(currentMCRFloor).to.be.equal(expectedMCRFloor);
    }

    {
      const previousMCRFloor = await mcr.mcrFloor();

      await increaseTime(daysToSeconds(2));
      await mineNextBlock();

      await mcr.updateMCR();

      const currentMCRFloor = await mcr.mcrFloor();
      const expectedMCRFloor = previousMCRFloor.mul(ratioScale.add(maxMCRFloorIncrement)).div(ratioScale);
      expect(currentMCRFloor).to.be.equal(expectedMCRFloor);
    }
  });

  it('increases desiredMCR when mcrWithGear exceeds current MCR if MCR% < 100%', async function () {
    const { master, cover, pool } = fixture;
    await pool.setPoolValueInEth(parseEther('120000'));
    await cover.setTotalActiveCoverInAsset(0, parseEther('800000'));

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);
    await mineNextBlock();

    await mcr.updateMCR();

    const desiredMCR = await mcr.desiredMCR();
    const totalSumAssured = await mcr.getAllSumAssurance();
    const gearingFactor = await mcr.gearingFactor();
    const expectedDesiredMCR = totalSumAssured.mul(10000).div(gearingFactor);
    expect(desiredMCR).to.be.equal(expectedDesiredMCR);
  });

  it('decreases desiredMCR towards mcrFloor when poolValueInEth = 0 and totalSumAssured = 0', async function () {
    const { master, pool } = fixture;

    const poolValueInEth = parseEther('120000');
    await pool.setPoolValueInEth(poolValueInEth);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: parseEther('160000'), master });
    const minUpdateTime = await mcr.minUpdateTime();

    await increaseTime(minUpdateTime + 1);
    await mineNextBlock();

    await mcr.updateMCR();

    const desiredMCR = await mcr.desiredMCR();
    expect(desiredMCR).to.be.equal(DEFAULT_MCR_PARAMS.mcrFloor);
  });
});
