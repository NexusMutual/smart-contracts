const { accounts } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { hex } = require('../utils').helpers;

const {
  calculateMCRRatio,
} = require('../utils').tokenPrice;

const [, notNotarise] = accounts;

describe('addMCRData', function () {

  it('increases MCR by 10%', async function () {

    const { p1: pool, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;
    const currentPoolValue = await pool.getPoolValueInEth();

    const lastMCREther = await pd.getLastMCREther();
    const newMCREth = lastMCREther.muln(110).divn(100);
    const newMCRRatio = calculateMCRRatio(currentPoolValue, newMCREth);
    const postedDate = 20200103;

    await mcr.addMCRData(
      newMCRRatio,
      newMCREth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      postedDate,
    );

    const { mcrPercx100: mcrPercentage, mcrEtherx1E18: mcrEth, vFull: totalAssetValue, date } = await pd.getLastMCR();

    assert.equal(mcrPercentage.toString(), newMCRRatio.toString());
    assert.equal(mcrEth.toString(), newMCREth.toString());
    assert.equal(totalAssetValue.toString(), currentPoolValue.toString());
    assert.equal(date.toString(), postedDate.toString());
  });

  it('decreases MCR by 10%', async function () {
    const { p1: pool, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;
    const currentPoolValue = await pool.getPoolValueInEth();

    const lastMCREther = await pd.getLastMCREther();
    const newMCREth = lastMCREther.muln(90).divn(100);
    const newMCRRatio = calculateMCRRatio(currentPoolValue, newMCREth);

    await mcr.addMCRData(
      newMCRRatio,
      newMCREth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      20200103,
    );

    const mcrEth = await pd.getLastMCREther();
    assert.equal(mcrEth.toString(), newMCREth.toString());
  });

  it('reverts when MCR is increased by 15%', async function () {
    const { p1: pool, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;
    const currentPoolValue = await pool.getPoolValueInEth();

    const lastMCREther = await pd.getLastMCREther();
    const newMCREth = lastMCREther.muln(115).divn(100);
    const newMCRRatio = calculateMCRRatio(currentPoolValue, newMCREth);

    await expectRevert(mcr.addMCRData(
      newMCRRatio,
      newMCREth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      20200103,
    ),
    'MCR: Failed',
    );
  });

  it('reverts when MCR is decreased by 20%', async function () {
    const { p1: pool, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;
    const currentPoolValue = await pool.getPoolValueInEth();

    const lastMCREther = await pd.getLastMCREther();
    const newMCREth = lastMCREther.muln(80).divn(100);
    const newMCRRatio = calculateMCRRatio(currentPoolValue, newMCREth);
    
    await expectRevert(mcr.addMCRData(
      newMCRRatio,
      newMCREth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      20200103,
    ),
    'MCR: Failed',
    );
  });

  it('reverts when caller is not notarise', async function () {
    const { p1: pool, mcr, pd } = this.contracts;
    const { ethEthRate, ethToDaiRate } = this.rates;
    const currentPoolValue = await pool.getPoolValueInEth();

    const lastMCREther = await pd.getLastMCREther();
    const newMCREth = lastMCREther.muln(110).divn(100);
    const newMCRRatio = calculateMCRRatio(currentPoolValue, newMCREth);

    await expectRevert.unspecified(mcr.addMCRData(
      newMCRRatio,
      newMCREth,
      currentPoolValue,
      [hex('ETH'), hex('DAI')],
      [ethEthRate, ethToDaiRate],
      20200103, {
        from: notNotarise,
      }),
    );
  });
});
