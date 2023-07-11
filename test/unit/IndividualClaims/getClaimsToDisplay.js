const { ethers } = require('hardhat');
const { expect } = require('chai');

const { ASSET, CLAIM_STATUS, PAYOUT_STATUS, getCoverSegment } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

const daysToSeconds = days => days * 24 * 60 * 60;

describe('getClaimsToDisplay', function () {
  it('aggregates and displays claims related data in a human-readable form', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const segment = await getCoverSegment();
    segment.period = daysToSeconds('66');
    const expectedProductIds = ['1', '0', '1', '0', '1'];
    const expectedClaimIds = ['0', '1', '2', '3', '4'];
    const expectedCoverIds = ['4', '2', '3', '1', '5'];
    const expectedAssessmentIds = ['0', '1', '2', '3', '4'];
    const expectedAssetSymbols = ['MOCK', 'MOCK', 'ETH', 'ETH', 'MOCK']; // MOCK is the symbol for the DAI mock
    const expectedAssetIndexes = ['1', '1', '0', '0', '1'];
    const expectedAmounts = [parseEther('10'), parseEther('20'), parseEther('30'), parseEther('40'), parseEther('40')];
    const expectedCoverStarts = [];
    const expectedPollStarts = [];

    {
      // 1
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [segment],
      );
      expectedCoverStarts[3] = timestamp + 1; // This will be the 4th calim
      await setTime(timestamp + daysToSeconds(1));
    }

    {
      // 2
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.DAI,
        [segment],
      );
      expectedCoverStarts[1] = timestamp + 1; // This will be the 2nd calim
      await setTime(timestamp + daysToSeconds(2));
    }

    {
      // 3
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        1, // productId
        ASSET.ETH,
        [segment],
      );
      expectedCoverStarts[2] = timestamp + 1; // This will be the 3rd calim
      await setTime(timestamp + daysToSeconds(4));
    }

    {
      // 4
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        1, // productId
        ASSET.DAI,
        [segment],
      );
      expectedCoverStarts[0] = timestamp + 1; // This will be the 1st calim
      await setTime(timestamp + daysToSeconds(1));
    }

    {
      // 5
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        1, // productId
        ASSET.DAI,
        [segment],
      );
      expectedCoverStarts[4] = timestamp + 1; // This will be the 5th calim
    }

    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        expectedAmounts[0],
        segment.period,
        ASSET.DAI,
      );
      await individualClaims.connect(coverOwner).submitClaim(4, 0, expectedAmounts[0], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStarts.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        expectedAmounts[1],
        segment.period,
        ASSET.DAI,
      );
      await individualClaims.connect(coverOwner).submitClaim(2, 0, expectedAmounts[1], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStarts.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        expectedAmounts[2],
        segment.period,
        ASSET.ETH,
      );
      await individualClaims.connect(coverOwner).submitClaim(3, 0, expectedAmounts[2], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStarts.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        expectedAmounts[3],
        segment.period,
        ASSET.ETH,
      );
      await individualClaims.connect(coverOwner).submitClaim(1, 0, expectedAmounts[3], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStarts.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await individualClaims.getAssessmentDepositAndReward(
        expectedAmounts[4],
        segment.period,
        ASSET.ETH,
      );
      await individualClaims.connect(coverOwner).submitClaim(5, 0, expectedAmounts[4], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStarts.push(latestBlock.timestamp);
    }

    const { minVotingPeriodInDays } = await assessment.config();
    const expectedPollEnds = expectedPollStarts.map(x => x + daysToSeconds(minVotingPeriodInDays));
    const expectedCoverEnds = expectedCoverStarts.map(x => x + segment.period);

    const res = await individualClaims.getClaimsToDisplay([0, 1, 2, 3, 4]);
    const actualClaimIds = res.map(x => x.id);
    const actualProductIds = res.map(x => x.productId);
    const actualCoverIds = res.map(x => x.coverId);
    const actualAssessmentIds = res.map(x => x.assessmentId);
    const actualAssetSymbols = res.map(x => x.assetSymbol);
    const actualAssetIndexes = res.map(x => x.assetIndex);
    const actualAmounts = res.map(x => x.amount);
    const actualCoverStarts = res.map(x => x.coverStart);
    const actualCoverEnds = res.map(x => x.coverEnd);
    const actualPollStarts = res.map(x => x.pollStart);
    const actualPollEnds = res.map(x => x.pollEnd);

    for (const i of [0, 1, 2, 3, 4]) {
      expect(actualClaimIds[i]).to.be.equal(expectedClaimIds[i]);
      expect(actualProductIds[i]).to.be.equal(expectedProductIds[i]);
      expect(actualCoverIds[i]).to.be.equal(expectedCoverIds[i]);
      expect(actualAssessmentIds[i]).to.be.equal(expectedAssessmentIds[i]);
      expect(actualAssetSymbols[i]).to.be.equal(expectedAssetSymbols[i]);
      expect(actualAssetIndexes[i]).to.be.equal(expectedAssetIndexes[i]);
      expect(actualAmounts[i]).to.be.equal(expectedAmounts[i]);
      expect(actualPollStarts[i]).to.be.equal(expectedPollStarts[i]);
      expect(actualPollEnds[i]).to.be.equal(expectedPollEnds[i]);
      expect(actualCoverStarts[i]).to.be.equal(expectedCoverStarts[i]);
      expect(actualCoverEnds[i]).to.be.equal(expectedCoverEnds[i]);
    }

    {
      const actualPayoutStatuses = res.map(x => x.payoutStatus.toNumber());
      const actualClaimStatuses = res.map(x => x.claimStatus.toNumber());
      for (const i of [0, 1]) {
        expect(actualClaimStatuses[i]).to.be.equal(CLAIM_STATUS.DENIED);
        expect(actualPayoutStatuses[i]).to.be.equal(PAYOUT_STATUS.DENIED);
      }

      for (const i of [2, 3]) {
        expect(actualClaimStatuses[i]).to.be.equal(CLAIM_STATUS.PENDING);
        expect(actualPayoutStatuses[i]).to.be.equal(PAYOUT_STATUS.PENDING);
      }
    }

    {
      const res = await individualClaims.getClaimsToDisplay([0, 1, 2, 3, 4]);
      const actualPayoutStatuses = res.map(x => x.payoutStatus.toNumber());
      const actualClaimStatuses = res.map(x => x.claimStatus.toNumber());

      await assessment.castVote(2, true, parseEther('100'));
      await assessment.castVote(3, true, parseEther('100'));
      await assessment.castVote(4, true, parseEther('100'));

      for (const i of [2, 3, 4]) {
        expect(actualClaimStatuses[i]).to.be.equal(CLAIM_STATUS.PENDING);
        expect(actualPayoutStatuses[i]).to.be.equal(PAYOUT_STATUS.PENDING);
      }
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      const res = await individualClaims.getClaimsToDisplay([0, 1, 2, 3, 4]);
      const actualPayoutStatuses = res.map(x => x.payoutStatus.toNumber());
      const actualClaimStatuses = res.map(x => x.claimStatus.toNumber());
      for (const i of [2, 3, 4]) {
        expect(actualClaimStatuses[i]).to.be.equal(CLAIM_STATUS.PENDING);
        expect(actualPayoutStatuses[i]).to.be.equal(PAYOUT_STATUS.PENDING);
      }
    }

    await assessment.castVote(2, false, parseEther('200'));
    await assessment.castVote(3, true, parseEther('200'));
    await assessment.castVote(4, true, parseEther('200'));

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(3));
    }

    {
      const res = await individualClaims.getClaimsToDisplay([0, 1, 2, 3, 4]);
      const actualPayoutStatuses = res.map(x => x.payoutStatus.toNumber());
      const actualClaimStatuses = res.map(x => x.claimStatus.toNumber());

      expect(actualClaimStatuses[2]).to.be.equal(CLAIM_STATUS.DENIED);
      expect(actualPayoutStatuses[2]).to.be.equal(PAYOUT_STATUS.DENIED);
      expect(actualClaimStatuses[3]).to.be.equal(CLAIM_STATUS.ACCEPTED);
      expect(actualPayoutStatuses[3]).to.be.equal(PAYOUT_STATUS.PENDING);
      expect(actualClaimStatuses[4]).to.be.equal(CLAIM_STATUS.ACCEPTED);
      expect(actualPayoutStatuses[4]).to.be.equal(PAYOUT_STATUS.PENDING);
    }

    await individualClaims.redeemClaimPayout(3);

    {
      const [claim] = await individualClaims.getClaimsToDisplay([3]);
      expect(claim.claimStatus.toNumber()).to.be.equal(CLAIM_STATUS.ACCEPTED);
      expect(claim.payoutStatus.toNumber()).to.be.equal(PAYOUT_STATUS.COMPLETE);
    }

    {
      const latestBlock = await ethers.provider.getBlock('latest');
      await setTime(latestBlock.timestamp + daysToSeconds(60));
    }

    {
      const [claim] = await individualClaims.getClaimsToDisplay([4]);
      expect(claim.claimStatus.toNumber()).to.be.equal(CLAIM_STATUS.ACCEPTED);
      expect(claim.payoutStatus.toNumber()).to.be.equal(PAYOUT_STATUS.UNCLAIMED);
    }
  });
});
