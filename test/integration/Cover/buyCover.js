const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { utils: { parseEther } } = ethers;

const {
  constants: { ZERO_ADDRESS },
} = require('@openzeppelin/test-helpers');
const { createStakingPool, assertCoverFields, buyCoverOnOnePool, MAX_COVER_PERIOD } = require('./helpers');
const { BigNumber } = require('ethers');
const { bnEqual } = require('../utils').helpers;

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
    const period = 3600 * 24 * 364; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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
        ipfsData: ''
      },
      [{
        poolId: '0',
        coverAmountInAsset: amount.toString()
      }],
      {
        value: expectedPremium,
      },
    );
    await tx.wait();

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId,
      {
        productId,
        payoutAsset,
        period,
        amount,
        targetPriceRatio
      });
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
    const period = 3600 * 24 * 28; // 30 days

    const amount = parseEther('1000');

    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const activeCover = parseEther('8000');
    const capacity = parseEther('10000');

    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);

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
        ipfsData: ''
      },
      [
        {
          poolId: '0',
          coverAmountInAsset: amount.div(2).toString()
        },
        {
          poolId: '1',
          coverAmountInAsset: amount.div(2).toString()
        },
      ],
      {
        value: expectedPremium,
      },
    );

    const expectedCoverId = '0';

    await assertCoverFields(cover, expectedCoverId,
      {
        productId,
        payoutAsset,
        period,
        amount,
        targetPriceRatio
      });
  });
});
