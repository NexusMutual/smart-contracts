const { assert } = require('chai');
const { ether, time, expectRevert } = require('@openzeppelin/test-helpers');
const { initMCR, MAX_PERCENTAGE_ADJUSTMENT } = require('./common');
const { hex } = require('../utils').helpers;

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

// MCR gearing is currently unimplemented and will be 0 for the time being
describe.skip('getGearedMCR', function () {
  it('should return gearedMCR = 0 if there are no active covers', async function () {
    const { master, quotationData } = this;

    await quotationData.setTotalSumAssured(hex('ETH'), '0');

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    await time.increase(time.duration.hours(2));

    const gearedMCR = await mcr.getGearedMCR();
    assert.equal(gearedMCR.toString(), '0');
  });

  it('should return correct geared MCR value', async function () {
    const { master, quotationData } = this;

    const sumAssuredEther = '10000';
    const sumAssured = ether(sumAssuredEther);
    await quotationData.setTotalSumAssured(hex('ETH'), sumAssuredEther);

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });

    await time.increase(time.duration.hours(2));

    const expectedGearedMCR = sumAssured.muln(10000).divn(48000);
    const gearedMCR = await mcr.getGearedMCR();
    assert.equal(gearedMCR.toString(), expectedGearedMCR.toString());
  });
});
