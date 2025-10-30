const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { daysToSeconds } = require('../../../lib/helpers');
const { signLimitOrder } = require('../utils').buyCover;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

const orderDetailsFixture = {
  coverId: 0,
  owner: AddressZero,
  productId: 1,
  coverAsset: 0,
  paymentAsset: 0,
  amount: parseEther('1'),
  period: daysToSeconds(30),
  commissionRatio: 0,
  commissionDestination: AddressZero,
  ipfsData: 'ipfs data',
};

const executionDetailsFixture = {
  maxPremiumInAsset: MaxUint256,
  renewableUntil: 180 * 24 * 60 * 60,
  renewablePeriodBeforeExpiration: 3 * 24 * 60 * 60,
};

describe('cancelOrder', function () {
  it('should cancel order', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner },
    } = fixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      buyer: limitOrderOwner.address,
    };
    const orderDetails = {
      ...orderDetailsFixture,
      owner: limitOrderOwner.address,
    };
    const { signature, digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      limitOrderOwner,
    );

    const tx = await limitOrders.connect(limitOrderOwner).cancelOrder(
      {
        ...orderDetails,
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

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      buyer: limitOrderOwner.address,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      owner: limitOrderOwner.address,
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      limitOrderOwner,
    );

    const tx = limitOrders.connect(notOwner).cancelOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'NotOrderOwner');
  });

  it('should fail to cancel the order if buyer is not the signer', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner, notOwner },
    } = fixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      buyer: limitOrderOwner.address,
    };

    const orderDetails = {
      ...orderDetailsFixture,
      owner: limitOrderOwner.address,
    };

    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      notOwner,
    );

    const tx = limitOrders.connect(notOwner).cancelOrder(
      {
        ...orderDetails,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'InvalidBuyerAddress');
  });

  it('should fail to cancel the order is already canceled', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner },
    } = fixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      buyer: limitOrderOwner.address,
    };
    const orderDetails = {
      ...orderDetailsFixture,
      owner: limitOrderOwner.address,
    };
    const { signature } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      limitOrderOwner,
    );

    await limitOrders.connect(limitOrderOwner).cancelOrder(
      {
        ...orderDetails,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    const tx = limitOrders.connect(limitOrderOwner).cancelOrder(
      {
        ...orderDetails,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
      signature,
    );

    await expect(tx).to.revertedWithCustomError(limitOrders, 'OrderAlreadyCancelled');
  });
});
