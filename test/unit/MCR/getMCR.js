const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { initMCR, MAX_PERCENTAGE_ADJUSTMENT } = require('./common');
const { increaseTime, mineNextBlock } = require('../utils').evm;
const { daysToSeconds, hoursToSeconds } = require('../utils').helpers;

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

describe('getMCR', function () {
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

    const expectedMCR = storedMCR
      .mul(BigNumber.from('10000').add(MAX_PERCENTAGE_ADJUSTMENT))
      .div(BigNumber.from('10000'));

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

    const expectedMCR = storedMCR.mul(10000 - MAX_PERCENTAGE_ADJUSTMENT.toNumber()).div(10000);
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
    const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());

    const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));
    const expectedMCR = storedMCR.mul(expectedPercentageIncrease).div(10000).add(storedMCR);
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

    const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
    const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));
    const expectedMCR = storedMCR.mul(expectedPercentageIncrease).div(10000).add(storedMCR);
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

    const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
    const expectedPercentageDecrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));
    const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageDecrease).div(10000));
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

    const maxMCRIncrement = BigNumber.from(await mcr.maxMCRIncrement());
    const expectedPercentageDecrease = maxMCRIncrement.mul(passedTime).div(daysToSeconds(1));
    const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageDecrease).div(10000));
    expect(newestMCR).to.be.equal(expectedMCR);
  });

  it('increases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.mul(1008).div(1000);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(desiredMCR);
  });

  it('decreases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.mul(992).div(1000);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(desiredMCR);
  });

  it('increases MCR by 1% if desiredMCR is 1% higher than current MCR', async function () {
    const fixture = await loadFixture(setup);
    const { master } = fixture;

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.mul(101).div(100);
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

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.mul(102).div(100);
    const mcrFloor = desiredMCR;
    const expectedMCR = DEFAULT_MCR_PARAMS.mcrValue.mul(101).div(100);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, mcrFloor, master });

    await increaseTime(hoursToSeconds(24));
    await mineNextBlock();

    const newestMCR = await mcr.getMCR();
    expect(newestMCR).to.be.equal(expectedMCR);
  });
});
