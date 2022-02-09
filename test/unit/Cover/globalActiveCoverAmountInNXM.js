const { assert, expect } = require('chai');
const {
  ethers: {
    utils: { parseEther },
  },
  time,
} = require('hardhat');
const {
  constants: { ZERO_ADDRESS },
} = require('@openzeppelin/test-helpers');
const { createStakingPool, assertCoverFields } = require('./helpers');
const { bnEqual } = require('../utils').helpers;

describe('globalActiveCoverAmountInNXM', function () {

  it('should compute globalActiveCoverAmountInNXM correctly at cover expiry', async function () {
    const { cover, coverViewer } = this;

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

    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    await cover.connect(member1).buyCover(
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

    const activeCoverAmountInNXM = await cover.globalActiveCoverAmountInNXM();
    bnEqual(activeCoverAmountInNXM, amount);

    // await time.increasesBy(period + 3600 * 24);
  });
});
