const { assert } = require('chai');
const { ether, time } = require('@openzeppelin/test-helpers');
const { initMCR } = require('./common');
const { hex } = require('../utils').helpers;

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

describe.only('getGearedMCR', function () {
  it('should return gearedMCR = 0 if there are no active covers', async function () {
    const { master, cover } = this;

    await cover.setTotalActiveCoverInAsset(0, '0'); // ETH

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    await time.increase(time.duration.hours(2));

    const gearedMCR = await mcr.getGearedMCR();
    assert.equal(gearedMCR.toString(), '0');
  });

  it('should return correct geared MCR value', async function () {
    const { master, cover } = this;

    const GEARING_FACTOR = 48000;
    const BASIS_PRECISION = 10000;

    const activeCoverAmountETH = '10000';
    const activeCoverAmount = ether(activeCoverAmountETH);

    await cover.setTotalActiveCoverInAsset(0, activeCoverAmountETH); // ETH
    await cover.setTotalActiveCoverInAsset(1, '0'); // DAI

    const mcr = await initMCR({ ...DEFAULT_MCR_PARAMS, master });
    await time.increase(time.duration.hours(2));

    const expectedGearedMCR = activeCoverAmount.muln(BASIS_PRECISION).divn(GEARING_FACTOR);
    const gearedMCR = await mcr.getGearedMCR();
    assert.equal(gearedMCR.toString(), expectedGearedMCR.toString());
  });
});
