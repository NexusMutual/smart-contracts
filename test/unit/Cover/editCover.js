const { assert } = require('chai');
const { web3, ethers: { utils: { parseEther } } } = require('hardhat');
const { time, expectRevert, constants: { ZERO_ADDRESS } } = require('@openzeppelin/test-helpers');
const { hex, zeroPadRight } = require('../utils').helpers;

const CoverMockStakingPool = artifacts.require('CoverMockStakingPool');

describe('editCover', function () {

  it('should edit purchased cover', async function () {
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

    const createStakingPoolTx = await cover.connect(stakingPoolManager).createStakingPool(stakingPoolManager.address);
    const createStakingPoolReceipt = await createStakingPoolTx.wait();

    const { stakingPoolAddress } = createStakingPoolReceipt.events[0].args;

    const stakingPool = await CoverMockStakingPool.at(stakingPoolAddress);

    await stakingPool.setStake(productId, capacity);
    await stakingPool.setTargetPrice(productId, targetPriceRatio);
    await stakingPool.setUsedCapacity(productId, activeCover);

    await stakingPool.setPrice(productId, targetPriceRatio); // 2.6%

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

    const increasedAmount = amount.mul(2);

    const expectedEditPremium = expectedPremium.mul(2);
    const extraPremium = expectedEditPremium.sub(expectedPremium);

    const expectedCoverId = '0';

    await cover.connect(member1).editCover(
      expectedCoverId,
      {
        owner: coverBuyer1.address,
        productId,
        payoutAsset,
        amount: increasedAmount,
        period,
        maxPremiumInAsset: expectedEditPremium,
        paymentAsset: payoutAsset,
        payWitNXM: false,
        commissionRatio: parseEther('0'),
        commissionDestination: ZERO_ADDRESS,
      },
      [{ poolId: '0', coverAmountInAsset: increasedAmount.toString() }],
      {
        value: extraPremium,
      },
    );

    const storedCover = await cover.covers(expectedCoverId);

    await assert.equal(storedCover.productId, productId);
    await assert.equal(storedCover.payoutAsset, payoutAsset);
    await assert.equal(storedCover.period, period);
    await assert.equal(storedCover.amount.toString(), increasedAmount.toString());
    await assert.equal(storedCover.priceRatio.toString(), targetPriceRatio.toString());
  });
});
