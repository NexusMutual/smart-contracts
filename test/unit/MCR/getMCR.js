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

  it('should return the initial MCR value if MCR == desiredMCR and no update happened', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();
    assert.equal(newestMCR.toString(), storedMCR.toString());
  });

  it('should increase MCR by MAX_PERCENTAGE_ADJUSTMENT towards the higher desired MCR if 12 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('160000'), master });

    await time.increase(time.duration.hours(12));

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = storedMCR.muln(10000 + MAX_PERCENTAGE_ADJUSTMENT.toNumber()).divn(10000);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('should decrease MCR by MAX_PERCENTAGE_ADJUSTMENT towards the lower desired MCR if 12 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('140000'), master });

    await time.increase(time.duration.hours(12));

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const expectedMCR = storedMCR.muln(10000 - MAX_PERCENTAGE_ADJUSTMENT.toNumber()).divn(10000);
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });

  it('should increase MCR by 0.4% towards higher desired MCR if 2 hour pass', async function () {
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

  it('should increase MCR by 0.4% towards lower desired MCR if 2 hours pass', async function () {
    const { master } = this;

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, desiredMCR: ether('140000'), master });

    const passedTime = time.duration.hours(2);
    await time.increase(passedTime);

    const storedMCR = await mcr.mcr();
    const newestMCR = await mcr.getMCR();

    const maxMCRIncrement = await mcr.maxMCRIncrement();
    const expectedPercentageDecreates = maxMCRIncrement.mul(passedTime).div(time.duration.days(1));
    const expectedMCR = storedMCR.sub(storedMCR.mul(expectedPercentageDecreates).divn(10000));
    assert.equal(newestMCR.toString(), expectedMCR.toString());
  });
});
