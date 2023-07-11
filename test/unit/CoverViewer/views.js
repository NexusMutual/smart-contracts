const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('views', function () {
  it('getCoverSegments returns segments', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverViewer } = fixture;

    const coverSegment = {
      amount: parseEther('100'),
      start: 1000,
      period: 30 * 24 * 3600, // 30 days
      gracePeriod: 7 * 24 * 3600, // 7 days
      globalRewardsRatio: 5000,
      globalCapacityRatio: 2000,
    };

    const coverData = {
      productId: 1,
      coverAsset: 0, // ETH
      amountPaidOut: 0,
    };

    const coverId = 1;

    await cover.addCoverData(coverId, coverData);
    await cover.addSegments(coverId, [coverSegment]);

    const segments = await coverViewer.getCoverSegments(coverId);
    expect(segments.length).to.be.equal(1);
    expect(segments[0].amount.toString()).to.be.equal(coverSegment.amount.toString());
    expect(segments[0].remainingAmount.toString()).to.be.equal(coverSegment.amount.toString());
    expect(segments[0].start).to.be.equal(coverSegment.start);
    expect(segments[0].period).to.be.equal(coverSegment.period);
    expect(segments[0].gracePeriod).to.be.equal(coverSegment.gracePeriod);
  });
});
