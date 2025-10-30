const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther, ZeroAddress } = ethers;

const { setup } = require('./setup');
const { increaseTime } = require('../../utils/evm');

const buyCoverFixture = {
  productId: 0,
  coverAsset: 0, // ETH
  poolId: 1n,
  segmentId: 0,
  period: 3600 * 24 * 30, // 30 days
  amount: parseEther('1000'),
  targetPriceRatio: 260,
  priceDenominator: 10000,
  activeCover: parseEther('8000'),
  capacity: parseEther('10000'),
  expectedPremium: (parseEther('1000') * 260n) / 10000n, // amount * targetPriceRatio / priceDenominator
};

const poolAllocationRequest = [{ poolId: 1n, coverAmountInAsset: buyCoverFixture.amount }];

async function updateTotalActiveCoverAmountSetup() {
  const fixture = await loadFixture(setup);
  const { cover } = fixture;
  const [coverBuyer] = fixture.accounts.members;

  const { amount, productId, coverAsset, period, expectedPremium } = buyCoverFixture;
  await cover.connect(coverBuyer).buyCover(
    {
      coverId: 0,
      owner: coverBuyer.address,
      productId,
      coverAsset,
      amount,
      period,
      maxPremiumInAsset: expectedPremium,
      paymentAsset: coverAsset,
      commissionRatio: parseEther('0'),
      commissionDestination: ZeroAddress,
      ipfsData: '',
    },
    poolAllocationRequest,
    { value: expectedPremium },
  );
  const coverId = await cover.getCoverDataCount();

  await increaseTime(31 * 24 * 60 * 60);

  await expect(cover.connect(coverBuyer).expireCover(coverId));

  return fixture;
}

describe('updateTotalActiveCoverAmount', function () {
  it('should recalculate totalCoverAmount', async function () {
    const fixture = await loadFixture(updateTotalActiveCoverAmountSetup);
    const { cover } = fixture;
    const { coverAsset } = buyCoverFixture;

    await increaseTime(7 * 24 * 60 * 60); // fastforward to next bucket
    await cover.updateTotalActiveCoverAmount(coverAsset);
    const totalCoverAmount = await cover.totalActiveCoverInAsset(coverAsset);

    expect(totalCoverAmount).to.be.equal(0);
  });
});
