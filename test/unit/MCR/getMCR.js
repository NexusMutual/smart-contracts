const { assert } = require('chai');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { initMCR, MAX_PERCENTAGE_ADJUSTMENT } = require('./common');

const accounts = require('../utils').accounts;

const DEFAULT_MCR_PARAMS = {
  mcrValue: ether('150000'),
  mcrFloor: ether('150000'),
  desiredMCR: ether('150000'),
  mcrFloorIncrementThreshold: '13000',
  maxMCRFloorIncrement: '100',
  maxMCRIncrement: '500',
  gearingFactor: '48000',
  minUpdateTime: '3600',
};

describe('getMCR', function () {

  it('should return the stored MCR value if MCR == desiredMCR', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    await time.increase(time.duration.hours(2));

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    assert.equal(newestMCR.toString(), storedMCR.toString());
  });

  it('increases MCR by MAX_PERCENTAGE_ADJUSTMENT towards the higher desired MCR if 24 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('160000'), master });

    await time.increase(time.duration.hours(24));

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = storedMCR.muln(10000 + MAX_PERCENTAGE_ADJUSTMENT.toNumber()).divn(10000);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('decreases MCR by MAX_PERCENTAGE_ADJUSTMENT towards the lower desired MCR if 24 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('140000'), master });

    await time.increase(time.duration.hours(24));

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = storedMCR.muln(10000 - MAX_PERCENTAGE_ADJUSTMENT.toNumber()).divn(10000);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('increases MCR by 0.4% towards higher desired MCR if 2 hour pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('160000'), master });

    const passedTime = time.duration.hours(2);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));
    const expectedMCR = storedMCR.mul(expectedPercentageIncrease).divn(10000).add(storedMCR);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('increases MCR by 0.8% towards higher desired MCR if 4 hour pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('160000'), master });

    const passedTime = time.duration.hours(4);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageIncrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));
    const expectedMCR = storedMCR.mul(expectedPercentageIncrease).divn(10000).add(storedMCR);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('decreases MCR by 0.4% towards lower desired MCR if 2 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({
      ...DEFAULT_MCR_PARAMS,
      mcrFloor: ether('130000'),
      desiredMCR: ether('130000'),
      master,
    });

    const passedTime = time.duration.hours(2);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageDecrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));
    const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageDecrease).divn(10000));
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('decreases MCR by 0.8% towards lower desired MCR if 4 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({
      ...DEFAULT_MCR_PARAMS,
      mcrFloor: ether('130000'),
      desiredMCR: ether('130000'),
      master,
    });

    const passedTime = time.duration.hours(4);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageDecrease = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));
    const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageDecrease).divn(10000));
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('increases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const { master } = this;

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.muln(1008).divn(1000);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await time.increase(time.duration.hours(24));

    const newestMCR = await mcr.getMCR();

    assert.equal(newestMCR.toString(), desiredMCR.toString());
  });

  it('decreases MCR to desiredMCR value if it is within 1% of stored mcr after 24 hours', async function () {
    const { master } = this;

    const desiredMCR = DEFAULT_MCR_PARAMS.mcrValue.muln(992).divn(1000);
    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR, master });

    await time.increase(time.duration.hours(24));

    const newestMCR = await mcr.getMCR();

    assert.equal(newestMCR.toString(), desiredMCR.toString());
  });
});
