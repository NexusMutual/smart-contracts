const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { signLimitOrder } = require('../utils').buyCover;

const { parseEther } = ethers.utils;
const { AddressZero, MaxUint256 } = ethers.constants;

describe('getOrderId', function () {
  it('should get order id', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner },
    } = fixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      notExecutableBefore: currentTimestamp,
      executableUntil: currentTimestamp + 3600,
      renewableUntil: currentTimestamp + 60 * 24 * 60 * 60,
      renewablePeriodBeforeExpiration: 3 * 24 * 60 * 60,
      maxPremiumInAsset: MaxUint256,
      buyer: limitOrderOwner.address,
    };
    const orderDetails = {
      coverId: 0,
      productId: 1,
      amount: parseEther('1'),
      period: 30 * 24 * 60 * 60,
      paymentAsset: 0,
      coverAsset: 0,
      owner: limitOrderOwner.address,
      ipfsData: 'ipfs data',
      commissionRatio: 0,
      commissionDestination: AddressZero,
    };
    const { digest } = await signLimitOrder(
      limitOrders.address,
      {
        orderDetails,
        executionDetails,
      },
      limitOrderOwner,
    );

    const orderId = await limitOrders.getOrderId(
      {
        ...orderDetails,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
    );

    await expect(orderId).to.equal(digest);
  });
});
