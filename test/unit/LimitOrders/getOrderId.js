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

const executionDetailsFixture = { maxPremiumInAsset: MaxUint256, maxNumberOfRenewals: 0, renewWhenLeft: 0 };

describe('getOrderId', function () {
  it('should get order id', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { limitOrders },
      accounts: { limitOrderOwner },
    } = fixture;
    const { productId, amount, period, ipfsData, commissionRatio, commissionDestination } = buyCoverFixture;

    const { timestamp: currentTimestamp } = await ethers.provider.getBlock('latest');
    const executionDetails = {
      ...executionDetailsFixture,
      notBefore: currentTimestamp,
      deadline: currentTimestamp + 3600,
    };
    const { digest } = await signCoverOrder(
      limitOrders.address,
      {
        coverId: 0,
        productId,
        amount,
        period,
        paymentAsset: 0,
        coverAsset: 0,
        owner: limitOrderOwner.address,
        ipfsData,
        commissionRatio,
        commissionDestination,
        executionDetails,
      },
      limitOrderOwner,
    );

    const orderId = await limitOrders.getOrderId(
      {
        ...buyCoverFixture,
        paymentAsset: 0, // ETH
        productId,
        owner: limitOrderOwner.address,
        maxPremiumInAsset: MaxUint256,
      },
      executionDetails,
    );

    await expect(orderId).to.equal(digest);
  });
});
