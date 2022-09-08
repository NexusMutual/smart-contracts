const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { utils: { parseEther } } = ethers;

const {
  constants: { ZERO_ADDRESS },
} = require('@openzeppelin/test-helpers');
const { BigNumber } = require('ethers');
const { bnEqual } = require('../utils').helpers;

describe('views', function () {

  it('getCoverSegments returns segments', async function () {
    const { cover, coverViewer } = this;

    const coverSegment1 = {
      amount: parseEther('100'),
      start: 1000,
      period: 3600 * 24 * 30, // seconds
      priceRatio: 3000,
      expired: false,
      globalRewardsRatio: 5000,
    };

    const coverId = 0;

    await cover.addSegments(coverId, [coverSegment1]);

    const segments = await coverViewer.getCoverSegments(coverId);

    assert.equal(segments.length, 1);
    assert(segments[0].amount.toString(), coverSegment1.amount.toString());
  });
});
