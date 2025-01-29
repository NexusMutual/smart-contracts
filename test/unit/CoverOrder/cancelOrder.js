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
      contracts: { limitOrders },
      accounts: { limitOrderOwner },
    } = fixture;
    const { productId, amount, period, ipfsData } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };
    const { signature, digest } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        paymentAsset: 0,
        coverAsset: 0,
        owner: limitOrderOwner.address,
        ipfsData,
        executionDetails,
      },
      limitOrderOwner,
    );

    const tx = await limitOrders.connect(limitOrderOwner).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.emit(limitOrders, 'OrderCancelled').withArgs(digest);
  });

  it('should fail to cancel the order if caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner, notOwner },
    } = fixture;
    const { productId, amount, period, ipfsData } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: MaxUint256,
    };

    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        paymentAsset: 0,
        coverAsset: 0,
        ipfsData,
        owner: limitOrderOwner.address,
        executionDetails,
      },
      limitOrderOwner,
    );

    const tx = limitOrders.connect(notOwner).cancelOrder(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        ipfsData,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'NotOrderOwner');
  });

  it('should fail to cancel the order is already executed', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders, dai },
      accounts: { limitOrderOwner, limitOrdersSettler },
    } = fixture;
    const { productId, amount, period, ipfsData } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
      maxPremiumInAsset: amount,
    };

    const { signature } = await signCoverOrder(
      limitOrders.address,
      {
        productId,
        amount,
        period,
        ipfsData,
        paymentAsset: 1,
        coverAsset: 1,
        owner: limitOrderOwner.address,
        executionDetails,
      },
      limitOrderOwner,
    );

    await dai.connect(limitOrderOwner).approve(limitOrders.address, amount);
    await limitOrders.connect(limitOrdersSettler).executeOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: amount,
        paymentAsset: 1,
        coverAsset: 1,
      },
      [{ poolId: 1, coverAmountInAsset: amount }],
      executionDetails,
      signature,
    );

    const tx = limitOrders.connect(limitOrderOwner).cancelOrder(
      {
        ...buyCoverFixture,
        productId,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: amount,
        paymentAsset: 1,
        coverAsset: 1,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'OrderAlreadyExecuted');
  });
});
