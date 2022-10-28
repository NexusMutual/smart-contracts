const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { submitClaim, ASSET, getCoverSegment } = require('./helpers');
const { mineNextBlock, setNextBlockTime, setEtherBalance } = require('../../utils/evm');
const { hex } = require('../../../lib/helpers');

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
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', {
        value: ethers.constants.Zero,
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('reverts if a payout on the same cover can be redeemed ', async function () {
    const { cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
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
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
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
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      2, // productId of type yield token cover
      ASSET.ETH,
      [segment],
    );
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).to.be.revertedWith(
      'Invalid claim method for this product type',
    );
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        1, // productId of type custodian cover
        ASSET.ETH,
        [segment],
      );
    }
    await expect(submitClaim(this)({ coverId: 1, sender: coverOwner })).not.to.be.revertedWith(
      'Invalid claim method for this product type',
    );
    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId of type protocol cover
        ASSET.ETH,
        [segment],
      );
    }
    await expect(submitClaim(this)({ coverId: 2, sender: coverOwner })).not.to.be.revertedWith('Invalid redeem method');
  });

  it('allows claim submission if an accepted claim is not redeemed during the redemption period', async function () {
    const { individualClaims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
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
    const coverAsset = ASSET.ETH;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, coverAsset);
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', {
        value: deposit.div('2'),
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('refunds any excess ETH sent as a submission deposit', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverAsset = ASSET.ETH;
    const segment = await getCoverSegment();

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, coverAsset);

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
    await individualClaims.connect(coverOwner).submitClaim(0, 0, segment.amount, '', {
      value: deposit.mul('2'),
      gasPrice: 0,
    });
    const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
    expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [segment],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await individualClaims.connect(coverOwner).submitClaim(1, 0, segment.amount, '', {
        value: deposit.mul('3'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [segment],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await individualClaims.connect(coverOwner).submitClaim(2, 0, segment.amount, '', {
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
    const coverAsset = ASSET.ETH;
    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment1.amount += 1;

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment0, segment1],
    );
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      segment0.amount,
      segment0.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment0.amount.add('1'), '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).to.be.revertedWith('Covered amount exceeded');
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, segment0.amount.add('1'), '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).not.to.be.revertedWith('Covered amount exceeded');
  });

  it('reverts if the cover segment starts in the future', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverAsset = ASSET.ETH;
    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment1.start += segment1.period;

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment0, segment1],
    );
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      segment0.amount,
      segment0.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, segment0.amount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover starts in the future');
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment0.amount, '', {
        value: deposit,
      }),
    ).not.to.be.revertedWith('Cover starts in the future');
  });

  it('reverts if the cover segment is outside the grace period', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverAsset = ASSET.ETH;
    const { gracePeriodInDays } = await cover.productTypes(0);
    const segment0 = await getCoverSegment();
    segment0.gracePeriodInDays = gracePeriodInDays;
    const segment1 = { ...segment0 };
    segment1.start += segment1.period;

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      coverAsset,
      [segment0, segment1],
    );

    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;
    await setTime(currentTime + segment0.period + daysToSeconds(gracePeriodInDays) + 1);
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      segment0.amount,
      segment0.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment0.amount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover is outside the grace period');

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, segment0.amount, '', {
        value: deposit,
      }),
    ).not.to.be.revertedWith('Cover is outside the grace period');
  });

  it('Assessment should use cover segment grace period and not product.gracePeriod', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const [boardMember] = this.accounts.advisoryBoardMembers;
    const coverAsset = ASSET.ETH;
    const { gracePeriodInDays } = await cover.productTypes(0);
    const segment0 = await getCoverSegment();
    const segment1 = await getCoverSegment();
    segment0.gracePeriodInDays = gracePeriodInDays;
    segment1.gracePeriodInDays = gracePeriodInDays + 1;
    segment1.start += segment1.period;
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      coverAsset,
      [segment0, segment1],
    );

    const longerGracePeriod = gracePeriodInDays * 100;
    await cover.connect(boardMember).editProductTypes([0], [longerGracePeriod], ['ipfs hash']);

    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;
    await setTime(currentTime + segment0.period + daysToSeconds(gracePeriodInDays) + 1);
    const coverId = 0;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      segment0.amount,
      segment0.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment0.amount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover is outside the grace period');

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 1, segment0.amount, '', {
        value: deposit,
      }),
    ).not.to.be.revertedWith('Cover is outside the grace period');
  });

  it('calls startAssessment and stores the returned assessmentId in the claim', async function () {
    const { assessment, individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverAsset = ASSET.ETH;
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      coverAsset,
      [segment],
    );

    const coverId = 0;

    const [expectedDeposit, expectedTotalReward] = await individualClaims.getAssessmentDepositAndReward(
      segment.amount,
      segment.period,
      coverAsset,
    );

    await individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', { value: expectedDeposit });

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
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;
    coverNFT.connect(coverOwner).transferFrom(coverOwner.address, nonMemberOwner.address, coverId);
    await expect(submitClaim(this)({ coverId, sender: nonMemberOwner })).to.be.revertedWith('Caller is not a member');
  });

  it('reverts if it is not called by cover owner or an approved address', async function () {
    const { cover, coverNFT } = this.contracts;
    const [coverOwner, otherMember] = this.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, sender: otherMember })).to.be.revertedWith(
      'Only the owner or approved addresses can submit a claim',
    );
    await expect(submitClaim(this)({ coverId, sender: coverOwner })).not.to.be.revertedWith(
      'Only the owner or approved addresses can submit a claim',
    );

    {
      const { timestamp } = await ethers.provider.getBlock('latest');
      segment.start = timestamp + 1;
      await cover.createMockCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        [segment],
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
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, ipfsMetadata, sender: coverOwner }))
      .to.emit(individualClaims, 'MetadataSubmitted')
      .withArgs(0, ipfsMetadata);
  });

  it("doesn't emit MetadataSubmitted event if ipfsMetadata is an empty string", async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, sender: coverOwner })).not.to.emit(individualClaims, 'MetadataSubmitted');
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [await getCoverSegment()],
    );
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

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [await getCoverSegment()],
    );
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

  it('reverts if the system is paused', async function () {
    const { individualClaims, cover, master } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();

    await master.pause();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    const coverId = 0;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', { value: deposit }),
    ).to.be.revertedWith('System is paused');
  });

  it('Should revert if the sender is not the NFT owner or an approved contract', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner, coverNonOwner] = this.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    const coverId = 0;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
    await expect(
      individualClaims.connect(coverNonOwner).submitClaim(coverId, 0, segment.amount, '', { value: deposit }),
    ).to.be.revertedWith('Only the owner or approved addresses can submit a claim');
  });

  it('Should transfer assessment deposit to pool', async function () {
    const { individualClaims, cover, pool } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    const balanceBefore = await ethers.provider.getBalance(pool.address);

    const coverId = 0;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
    await individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', { value: deposit });
    await expect(await ethers.provider.getBalance(pool.address)).to.be.equal(balanceBefore.add(deposit));
  });

  it('Should emit ClaimSubmitted event', async function () {
    const { individualClaims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const segment = await getCoverSegment();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    const coverId = 0;
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, ASSET.ETH);
    await expect(individualClaims.connect(coverOwner).submitClaim(coverId, 0, segment.amount, '', { value: deposit }))
      .to.emit(individualClaims, 'ClaimSubmitted')
      .withArgs(coverOwner.address, 0, coverId, 0);
  });

  it('should revert if ETH refund fails', async function () {
    const { individualClaims, memberRoles, cover, nxm: fallbackWillFailContract } = this.contracts;
    const coverAsset = ASSET.ETH;
    const segment = await getCoverSegment();

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, coverAsset);

    const fallbackWillFailSigner = await ethers.getImpersonatedSigner(fallbackWillFailContract.address);

    await memberRoles.setRole(fallbackWillFailSigner.address, 2);

    await setEtherBalance(fallbackWillFailSigner.address, ethers.utils.parseEther('1'));

    await cover.createMockCover(
      fallbackWillFailSigner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await expect(
      individualClaims.connect(fallbackWillFailSigner).submitClaim(0, 0, segment.amount, '', {
        value: deposit.mul('2'),
        gasPrice: 0,
      }),
    ).to.be.revertedWith('Assessment deposit excess refund failed');
  });

  it('should revert if assessment deposit to pool fails', async function () {
    const { individualClaims, cover, master } = this.contracts;
    const coverAsset = ASSET.ETH;
    const segment = await getCoverSegment();
    const [coverOwner] = this.accounts.members;

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(segment.amount, segment.period, coverAsset);

    const CLMockPoolEtherRejecter = await ethers.getContractFactory('CLMockPoolEtherRejecter');

    const fallbackWillFailContractPool = await CLMockPoolEtherRejecter.deploy();
    await master.setLatestAddress(hex('P1'), fallbackWillFailContractPool.address);
    await individualClaims.changeDependentContractAddress();

    await cover.createMockCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      [segment],
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(0, 0, segment.amount, '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).to.be.revertedWith('Assessment deposit transfer to pool failed');
  });
});
