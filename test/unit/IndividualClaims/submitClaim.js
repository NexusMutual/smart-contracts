const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { submitClaim, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('submitClaim', function () {
  it('reverts if the submission deposit is not sent', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverAmount = parseEther('100');
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
    );
    const coverId = 0;
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', {
        value: ethers.constants.Zero,
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('reverts if a payout on the same cover can be redeemed ', async function () {
    const { cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
    );
    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays));
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).to.be.revertedWith(
      'A payout can still be redeemed',
    );
  });

  it('reverts if a claim on the same cover is already being assessed', async function () {
    const { cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
    );
    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).to.be.revertedWith(
      'A claim is already being assessed',
    );
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + daysToSeconds(poll.end));
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).not.to.be.revertedWith(
      'A claim is already being assessed',
    );
  });

  it('reverts if covered product uses a claimMethod other than individual claims', async function () {
    const { cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        2, // productId of type yield token cover
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).to.be.revertedWith(
      'Invalid claim method for this product type',
    );
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        1, // productId of type custodian cover
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    await expect(submitClaim(this)({ coverId: 1, sender: coverOwner })).not.to.be.revertedWith(
      'Invalid claim method for this product type',
    );
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId of type protocol cover
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    await expect(submitClaim(this)({ coverId: 2, sender: coverOwner })).not.to.be.revertedWith('Invalid redeem method');
  });

  it('allows claim submission if an accepted claim is not redeemed during the redemption period', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    const { payoutRedemptionPeriodInDays } = await individualClaims.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays));
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).not.to.be.reverted;
  });

  it('reverts if the submission deposit is less than the expected amount', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 0, false, 0]],
      );
    }
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, coverAsset);
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', {
        value: deposit.div('2'),
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('refunds any excess ETH sent as a submission deposit', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, coverAsset);

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 0, false, 0]],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await individualClaims.connect(coverOwner).submitClaim(0, 0, coverAmount, '', {
        value: deposit.mul('2'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 0, false, 0]],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await individualClaims.connect(coverOwner).submitClaim(1, 0, coverAmount, '', {
        value: deposit.mul('3'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[coverAmount, timestamp + 1, coverPeriod, 0, false, 0]],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await individualClaims.connect(coverOwner).submitClaim(2, 0, coverAmount, '', {
        value: deposit.mul('10'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }
  });

  it('reverts if the requested amount exceeds cover segment amount', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [
          [coverAmount, timestamp + 1, 0, 0, false, 0],
          [coverAmount.add('1'), timestamp + 1, coverPeriod, 0, false, 0],
        ],
      );
    }
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, coverAsset);

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount.add('1'), '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).to.be.revertedWith('Covered amount exceeded');
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, coverAmount.add('1'), '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).not.to.be.revertedWith('Covered amount exceeded');
  });

  it('reverts if the cover segment starts in the future', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [
        [coverAmount, timestamp, coverPeriod, 0, false, 0],
        [coverAmount, timestamp + coverPeriod, coverPeriod, 0, false, 0],
      ],
    );
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, coverAsset);

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, coverAmount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover starts in the future');
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', {
        value: deposit,
      }),
    ).not.to.be.revertedWith('Cover starts in the future');
  });

  it('reverts if the cover segment is outside the grace period', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;
    const { gracePeriodInDays } = await cover.productTypes(0);
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        coverAsset,
        [
          [coverAmount, timestamp + 1, coverPeriod, 0, false, 0],
          [coverAmount, timestamp + coverPeriod + 1, coverPeriod, 0, false, 0],
        ],
      );
    }

    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;
    await setTime(currentTime + coverPeriod + daysToSeconds(gracePeriodInDays) + 1);
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(coverAmount, coverPeriod, coverAsset);

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover is outside the grace period');

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, coverAmount, '', {
        value: deposit,
      }),
    ).not.to.be.revertedWith('Cover is outside the grace period');
  });

  it('calls startAssessment and stores the returned assessmentId in the claim', async function () {
    const { assessment, individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const coverAsset = ASSET.ETH;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        coverAsset,
        [[coverAmount, timestamp + 1, coverPeriod, 0, false, 0]],
      );
    }

    const coverId = 0;

    const [expectedDeposit, expectedTotalReward] = await individualClaims.getAssessmentDepositAndReward(
      coverAmount,
      coverPeriod,
      coverAsset,
    );

    await individualClaims.connect(coverOwner).submitClaim(coverId, 0, coverAmount, '', { value: expectedDeposit });

    const expectedAssessmentId = 0;
    const { assessmentDepositInETH, totalRewardInNXM } = await assessment.assessments(expectedAssessmentId);

    expect(assessmentDepositInETH).to.be.equal(expectedDeposit);
    expect(totalRewardInNXM).to.be.equal(expectedTotalReward);

    const { assessmentId } = await individualClaims.claims(0);
    expect(assessmentId).to.be.equal(expectedAssessmentId);
  });

  it('reverts if called by non-member address', async function () {
    const { coverNFT, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const [nonMemberOwner] = this.accounts.nonMembers;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    const coverId = 0;
    coverNFT.connect(coverOwner).transferFrom(coverOwner.address, nonMemberOwner.address, coverId);
    await expect(submitClaim(this)({ coverId, sender: nonMemberOwner })).to.be.reverted;
  });

  it('reverts if it is not called by cover owner or an approved address', async function () {
    const { cover, coverNFT } = this.contracts;
    const [coverOwner, otherMember] = this.accounts.members;

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
      const coverId = 0;
      await expect(submitClaim(this)({ coverId, sender: otherMember })).to.be.revertedWith(
        'Only the owner or approved addresses can submit a claim',
      );
      await expect(submitClaim(this)({ coverId, sender: coverOwner })).not.to.be.revertedWith(
        'Only the owner or approved addresses can submit a claim',
      );
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
      const coverId = 1;
      await coverNFT.connect(coverOwner).approve(otherMember.address, coverId);
      await expect(submitClaim(this)({ coverId, sender: otherMember })).not.to.be.revertedWith(
        'Only the owner or approved addresses can submit a claim',
      );
    }
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not an empty string', async function () {
    const { individualClaims, cover } = this.contracts;
    const ipfsMetadata = 'ipfsProofHashMock';
    const [coverOwner] = this.accounts.members;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, ipfsMetadata, sender: coverOwner }))
      .to.emit(individualClaims, 'MetadataSubmitted')
      .withArgs(0, ipfsMetadata);
  });

  it("doesn't emit MetadataSubmitted event if ipfsMetadata is an empty string", async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const { timestamp } = await ethers.provider.getBlock('latest');
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, sender: coverOwner }))
      .not.to.emit(individualClaims, 'MetadataSubmitted')
      .withArgs(0, '');
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    const firstCoverId = 0;

    {
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(this)({ coverId: firstCoverId, sender: coverOwner });
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [[parseEther('100'), timestamp + 1, daysToSeconds(30), 0, false, 0]],
      );
    }
    const secondCoverId = 1;

    {
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(this)({ coverId: secondCoverId, sender: coverOwner });
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.One);
    }
  });
});
