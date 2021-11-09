const { ethers } = require('hardhat');
const { expect } = require('chai');

const { daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getClaimsToDisplay', function () {
  it('aggregates and displays claims related data in a human-readable form', async function () {
    const { claims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(66);
    const coverAmount = parseEther('100');
    const expectedProductIds = ['1', '0', '1', '0'];
    const expectedClaimIds = ['0', '1', '2', '3'];
    const expectedCoverIds = ['3', '1', '2', '0'];
    const expectedAssetSymbols = ['MOCK', 'MOCK', 'ETH', 'ETH']; // MOCk is the symbol for the DAI mock
    const expectedAssetIndexes = ['1', '1', '0', '0'];
    const expectedAmounts = [parseEther('10'), parseEther('20'), parseEther('30'), parseEther('40')];
    const expectedCoverStart = [];
    const expectedPollStart = [];

    {
      // 0
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedCoverStart[3] = latestBlock.timestamp + 1; // This will be the 4th calim
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      // 1
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.DAI,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedCoverStart[1] = latestBlock.timestamp + 1; // This will be the 2nd calim
      await setTime(latestBlock.timestamp + daysToSeconds(2));
    }

    {
      // 2
      await cover.buyCover(
        coverOwner.address,
        1, // productId
        ASSET.ETH,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedCoverStart[2] = latestBlock.timestamp + 1; // This will be the 3rd calim
      await setTime(latestBlock.timestamp + daysToSeconds(4));
    }

    {
      // 3
      await cover.buyCover(
        coverOwner.address,
        1, // productId
        ASSET.DAI,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedCoverStart[0] = latestBlock.timestamp + 1; // This will be the 1st calim
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    {
      const [deposit] = await claims.getAssessmentDepositAndReward(expectedAmounts[0], coverPeriod, ASSET.DAI);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](3, expectedAmounts[0], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStart.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(expectedAmounts[1], coverPeriod, ASSET.DAI);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](1, expectedAmounts[1], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStart.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(expectedAmounts[2], coverPeriod, ASSET.ETH);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](2, expectedAmounts[2], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStart.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }
    {
      const [deposit] = await claims.getAssessmentDepositAndReward(expectedAmounts[3], coverPeriod, ASSET.ETH);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](0, expectedAmounts[3], '', {
        value: deposit,
      });
      const latestBlock = await ethers.provider.getBlock('latest');
      expectedPollStart.push(latestBlock.timestamp);
      await setTime(latestBlock.timestamp + daysToSeconds(1));
    }

    const { minVotingPeriodDays } = await assessment.config();
    const expectedPollEnd = expectedPollStart.map(x => x + daysToSeconds(minVotingPeriodDays));
    const expectedCoverEnd = expectedCoverStart.map(x => x + coverPeriod);

    const res = await claims.getClaimsToDisplay([0, 1, 2, 3]);
    const actualClaimIds = res.map(x => x.id);
    const actualProductIds = res.map(x => x.productId);
    const actualCoverIds = res.map(x => x.coverId);
    const actualAssetSymbols = res.map(x => x.assetSymbol);
    const actualAssetIndexes = res.map(x => x.assetIndex);
    const actualAmounts = res.map(x => x.amount);
    const actualCoverStart = res.map(x => x.coverStart);
    const actualCoverEnd = res.map(x => x.coverEnd);
    const actualPollStart = res.map(x => x.pollStart);
    const actualPollEnd = res.map(x => x.pollEnd);

    for (const i of [0, 1, 2, 3]) {
      expect(actualClaimIds[i]).to.be.equal(expectedClaimIds[i]);
      expect(actualProductIds[i]).to.be.equal(expectedProductIds[i]);
      expect(actualCoverIds[i]).to.be.equal(expectedCoverIds[i]);
      expect(actualAssetSymbols[i]).to.be.equal(expectedAssetSymbols[i]);
      expect(actualAssetIndexes[i]).to.be.equal(expectedAssetIndexes[i]);
      expect(actualAmounts[i]).to.be.equal(expectedAmounts[i]);
      expect(actualPollStart[i]).to.be.equal(expectedPollStart[i]);
      expect(actualPollEnd[i]).to.be.equal(expectedPollEnd[i]);
      expect(actualCoverStart[i]).to.be.equal(expectedCoverStart[i]);
      expect(actualCoverEnd[i]).to.be.equal(expectedCoverEnd[i]);
    }
  });
});
