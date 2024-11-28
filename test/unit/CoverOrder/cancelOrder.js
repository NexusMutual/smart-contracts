const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { daysToSeconds } = require('../../../lib/helpers');
const { signCoverOrder } = require('../utils').buyCover;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const buyCoverFixture = {
  coverId: 0,
  owner: AddressZero,
  productId: 1,
  coverAsset: 0b0,
  amount: parseEther('1'),
  period: daysToSeconds(30),
  maxPremiumInAsset: MaxUint256,
  paymentAsset: 0b0,
  commissionRatio: 0,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

describe('cancelOrder', function () {
  it('should cancel order', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverOrder },
      accounts: { coverOrderOwner },
    } = fixture;
    const { productId, amount, period } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };
    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        paymentAsset: 0,
        coverAsset: 0,
        owner: coverOrderOwner.address,
        executionDetails,
      },
      coverOrderOwner,
    );

    const tx = await coverOrder.connect(coverOrderOwner).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.emit(coverOrder, 'OrderCancelled').withArgs(signature);
  });

  it('should fail to cancel the order if caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverOrder },
      accounts: { coverOrderOwner, notOwner },
    } = fixture;
    const { productId, amount, period } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };

    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        paymentAsset: 0,
        coverAsset: 0,
        owner: coverOrderOwner.address,
        executionDetails,
      },
      coverOrderOwner,
    );

    const tx = coverOrder.connect(notOwner).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(coverOrder, 'NotOrderOwner');
  });

  it('should fail to cancel the order is already executed', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverOrder, dai },
      accounts: { coverOrderOwner, coverOrderSettler },
    } = fixture;
    const { productId, amount, period } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: amount,
    };

    const signature = await signCoverOrder(
      coverOrder.address,
      {
        productId,
        amount,
        period,
        paymentAsset: 1,
        coverAsset: 1,
        owner: coverOrderOwner.address,
        executionDetails,
      },
      coverOrderOwner,
    );

    await dai.connect(coverOrderOwner).approve(coverOrder.address, amount);
    await coverOrder.connect(coverOrderSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: coverOrderOwner.address,
        maxPremiumInAsset: amount,
        paymentAsset: 1,
        coverAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    const tx = coverOrder.connect(coverOrderOwner).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: coverOrderOwner.address,
        maxPremiumInAsset: amount,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(coverOrder, 'OrderAlreadyExecuted');
  });
});
