const { expect } = require('chai');
const { ethers } = require('hardhat');
const { parseEther } = ethers.utils;
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('views', function () {
  it('getCovers returns correct coverData', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverViewer } = fixture;

    const coverData = {
      productId: 1,
      coverAsset: 0, // ETH
      amount: parseEther('100'),
      start: 1000,
      period: 30 * 24 * 3600, // 30 days
      gracePeriod: 7 * 24 * 3600, // 7 days
      rewardsRatio: 5000,
      capacityRatio: 2000,
    };

    const coverReference = {
      originalCoverId: 1,
      latestCoverId: 2,
    };

    const coverId = 1;

    await cover.addCoverDataWithReference(coverId, coverData, coverReference);

    const coverDataView = await coverViewer.getCovers([coverId]);

    expect(coverDataView.length).to.be.equal(1);
    expect(coverDataView[0].productId).to.be.equal(coverData.productId);
    expect(coverDataView[0].coverAsset).to.be.equal(coverData.coverAsset);
    expect(coverDataView[0].amount.toString()).to.be.equal(coverData.amount.toString());
    expect(coverDataView[0].start).to.be.equal(coverData.start);
    expect(coverDataView[0].period).to.be.equal(coverData.period);
    expect(coverDataView[0].gracePeriod).to.be.equal(coverData.gracePeriod);
    expect(coverDataView[0].originalCoverId).to.be.equal(coverReference.originalCoverId);
    expect(coverDataView[0].latestCoverId).to.be.equal(coverReference.latestCoverId);
  });
});
