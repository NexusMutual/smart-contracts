const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;

describe('views', function () {
  it('getCoverSegments returns segments', async function () {
    const { cover, coverViewer } = this;

    const coverSegment = {
      amount: parseEther('100'),
      start: 1000,
      period: 30 * 24 * 3600, // 30 days
      gracePeriod: 7 * 24 * 3600, // 7 days
      globalRewardsRatio: 5000,
      globalCapacityRatio: 2000,
    };

    const coverId = 1;
    await cover.addSegments(coverId, [coverSegment]);

    const segments = await coverViewer.getCoverSegments(coverId);

    expect(segments.length).to.be.equal(1);
    expect(segments[0].amount.toString()).to.be.equal(coverSegment.amount.toString());
    expect(segments[0].start).to.be.equal(coverSegment.start);
    expect(segments[0].period).to.be.equal(coverSegment.period);
    expect(segments[0].gracePeriod).to.be.equal(coverSegment.gracePeriod);
    expect(segments[0].globalRewardsRatio).to.be.equal(coverSegment.globalRewardsRatio);
  });
});
