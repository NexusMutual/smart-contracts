const { assert } = require('chai');
const {
  web3,
  ethers: {
    utils: { parseEther },
  },
} = require('hardhat');
const { time, expectRevert, constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const { hex, zeroPadRight } = require('../utils').helpers;
const { createStakingPool } = require('./helpers');

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

describe('buyCover', function () {
  it('should purchase new cover using 1 staking pool', async function () {
    const { cover } = this;

    const {
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1, stakingPoolManager],
    } = this.accounts;

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).setGlobalCapacityRatio(capacityFactor);

    const stakingPool = await createStakingPool(
      cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
    );

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    const tx = await cover.connect(member1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: amount.toString() }],
      {
        value: expectedPremium,
      },
    );

    const expectedCoverId = '0';

    const storedCover = await cover.covers(expectedCoverId);

    await assert.equal(storedCover.productId, productId);
    await assert.equal(storedCover.payoutAsset, payoutAsset);
    await assert.equal(storedCover.period, period);
    await assert.equal(storedCover.amount.toString(), amount.toString());
    await assert.equal(storedCover.priceRatio.toString(), targetPriceRatio.toString());
  });

  it('should purchase new cover using 2 staking pools', async function () {
    const { cover } = this;

    const {
      governanceContracts: [gv1],
      members: [member1],
      members: [coverBuyer1, stakingPoolManager],
    } = this.accounts;

    const productId = 0;
    const payoutAsset = 0; // ETH
    const period = 3600 * 24 * 30; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).setGlobalCapacityRatio(capacityFactor);

    await createStakingPool(
      cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
    );

    // create a 2nd pool
    await createStakingPool(
      cover, productId, capacity, targetPriceRatio, activeCover, stakingPoolManager, stakingPoolManager, targetPriceRatio,
    );

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    const tx = await cover.connect(member1).buyCover(
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount,
        period,
        maxPremiumInAsset: expectedPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [
        { poolId: '0', coverAmountInAsset: amount.div(2).toString() },
        { poolId: '1', coverAmountInAsset: amount.div(2).toString() },
      ],
      {
        value: expectedPremium,
      },
    );

    const expectedCoverId = '0';

    const storedCover = await cover.covers(expectedCoverId);

    await assert.equal(storedCover.productId, productId);
    await assert.equal(storedCover.payoutAsset, payoutAsset);
    await assert.equal(storedCover.period, period);
    await assert.equal(storedCover.amount.toString(), amount.toString());
    await assert.equal(storedCover.priceRatio.toString(), targetPriceRatio.toString());
  });

});
