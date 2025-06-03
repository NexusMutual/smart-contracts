const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { initMCR, MAX_PERCENTAGE_ADJUSTMENT } = require('./common');
const { increaseTime, mineNextBlock, setNextBlockTime } = require('../utils').evm;
const { daysToSeconds, hoursToSeconds } = require('../utils').helpers;

const { parseEther } = ethers;

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

describe('getMCR', function () {
  it('should return the current MCR value', async function () {
    const fixture = await loadFixture(setup);
    const { mcr } = fixture.contracts;

    const mcrValue = await mcr.getMCR();
    expect(mcrValue).to.be.equal(parseEther('7000'));
  });

  it('should return the current MCR value after an update', async function () {
    const fixture = await loadFixture(setup);
    const { mcr } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    expect(mcrValue).to.be.equal(parseEther('7000'));
  });

  it('should return the current MCR value after an update with a price increase', async function () {
    const fixture = await loadFixture(setup);
    const { mcr, pool } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);

    await pool.setTokenPrice(0, parseEther('0.0347'));
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    const MAX_PERCENTAGE_ADJUSTMENT = 100n;
    const expectedMCR = (parseEther('7000') * (10000n + MAX_PERCENTAGE_ADJUSTMENT)) / 10000n;
    expect(mcrValue).to.be.equal(expectedMCR);
  });

  it('should return the current MCR value after an update with a price decrease', async function () {
    const fixture = await loadFixture(setup);
    const { mcr, pool } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);

    await pool.setTokenPrice(0, parseEther('0.0347'));
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedMCR = parseEther('7000') + maxMCRIncrement;
    expect(mcrValue).to.be.equal(expectedMCR);
  });

  it('should return the current MCR value after multiple updates with price increases', async function () {
    const fixture = await loadFixture(setup);
    const { mcr, pool } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);

    await pool.setTokenPrice(0, parseEther('0.0347'));
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedMCR = parseEther('7000') + maxMCRIncrement;
    expect(mcrValue).to.be.equal(expectedMCR);
  });

  it('should return the current MCR value after multiple updates with price decreases', async function () {
    const fixture = await loadFixture(setup);
    const { mcr, pool } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);

    await pool.setTokenPrice(0, parseEther('0.0347'));
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedMCR = parseEther('7000') + maxMCRIncrement;
    expect(mcrValue).to.be.equal(expectedMCR);
  });

  it('should return the current MCR value after multiple updates with mixed price changes', async function () {
    const fixture = await loadFixture(setup);
    const { mcr, pool } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + daysToSeconds(1);

    await pool.setTokenPrice(0, parseEther('0.0347'));
    await setNextBlockTime(nextBlockTimestamp);

    const mcrValue = await mcr.getMCR();
    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedMCR = parseEther('7000') + maxMCRIncrement;
    expect(mcrValue).to.be.equal(expectedMCR);
  });

  it('should return the stored MCR value if MCR == desiredMCR', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    await increaseTime(hoursToSeconds(2));
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(storedMCR);
  });

  it('increases MCR by MAX_PERCENTAGE_ADJUSTMENT towards the higher desired MCR if 24 hours pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: parseEther('160000'), master });

    await increaseTime(daysToSeconds(1));
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = (BigInt(storedMCR) * (10000n + BigInt(MAX_PERCENTAGE_ADJUSTMENT))) / 10000n;
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('decreases MCR by MAX_PERCENTAGE_ADJUSTMENT towards the lower desired MCR if 24 hours pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: parseEther('140000'), master });
    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = (BigInt(storedMCR) * BigInt(10000 - Number(MAX_PERCENTAGE_ADJUSTMENT))) / 10000n;
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('increases MCR by 0.4% towards higher desired MCR if 2 hour pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: parseEther('160000'), master });

    const passedTime = hoursToSeconds(2);
    await increaseTime(passedTime);
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());

    const expectedPercentageIncrease = (maxMCRIncrement * BigInt(passedTime)) / BigInt(daysToSeconds(1));
    const expectedMCR = (BigInt(storedMCR) * expectedPercentageIncrease) / 10000n + BigInt(storedMCR);
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('increases MCR by 0.8% towards higher desired MCR if 4 hour pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: parseEther('160000'), master });

    const passedTime = hoursToSeconds(4);
    await increaseTime(passedTime);
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedPercentageIncrease = (maxMCRIncrement * BigInt(passedTime)) / BigInt(daysToSeconds(1));
    const expectedMCR = (BigInt(storedMCR) * expectedPercentageIncrease) / 10000n + BigInt(storedMCR);
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('decreases MCR by 0.4% towards lower desired MCR if 2 hours pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({
      ...DEFAULT_MCR_PARAMS,
      mcrFloor: parseEther('130000'),
      desiredMCR: parseEther('130000'),
      master,
    });

    const passedTime = hoursToSeconds(2);
    await increaseTime(passedTime);
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedPercentageDecrease = (maxMCRIncrement * BigInt(passedTime)) / BigInt(daysToSeconds(1));
    const expectedMCR = BigInt(storedMCR) - (BigInt(storedMCR) * expectedPercentageDecrease) / 10000n;
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('decreases MCR by 0.8% towards lower desired MCR if 4 hours pass', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const mcr = await initMCR({
      ...DEFAULT_MCR_PARAMS,
      mcrFloor: parseEther('130000'),
      desiredMCR: parseEther('130000'),
      master,
    });

    const passedTime = hoursToSeconds(4);
    await increaseTime(passedTime);
    await mineNextBlock();

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = BigInt(await mcr.maxMCRIncrement());
    const expectedPercentageDecrease = (maxMCRIncrement * BigInt(passedTime)) / BigInt(daysToSeconds(1));
    const expectedMCR = BigInt(storedMCR) - (BigInt(storedMCR) * expectedPercentageDecrease) / 10000n;
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('increases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = (BigInt(DEFAULT_MCR_PARAMS.mcrValue) * 1008n) / 1000n;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(desiredMCR);
  });

  it('decreases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = (BigInt(DEFAULT_MCR_PARAMS.mcrValue) * 992n) / 1000n;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(desiredMCR);
  });

  it('increases MCR by 1% if desiredMCR is 1% higher than current MCR', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = (BigInt(DEFAULT_MCR_PARAMS.mcrValue) * 101n) / 100n;
    const mcrFloor = desiredMCR;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, mcrFloor, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(desiredMCR);
  });

  it('increases MCR by 1% if desiredMCR is 2% higher than current MCR', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = (BigInt(DEFAULT_MCR_PARAMS.mcrValue) * 102n) / 100n;
    const mcrFloor = desiredMCR;
    const expectedMCR = (BigInt(DEFAULT_MCR_PARAMS.mcrValue) * 101n) / 100n;
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, mcrFloor, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(expectedMCR);
  });
});
