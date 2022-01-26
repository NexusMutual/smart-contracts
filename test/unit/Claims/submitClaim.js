const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { submitClaim, daysToSeconds, ASSET } = require('./helpers');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('submitClaim', function () {
  it('calls migrateCoverFromOwner with the correct parameters when a legacy coverId is provided as a parameter', async function () {
    const { claims, cover, distributor } = this.contracts;
    const [coverOwner] = this.accounts.members;

    {
      await claims.connect(coverOwner)['submitClaim(uint256)'](123);
      const migrateCoverFromOwnerCalledWith = await cover.migrateCoverFromOwnerCalledWith();
      expect(migrateCoverFromOwnerCalledWith.coverId).to.be.equal(123);
      expect(migrateCoverFromOwnerCalledWith.fromOwner).to.be.equal(coverOwner.address);
      expect(migrateCoverFromOwnerCalledWith.toNewOwner).to.be.equal(coverOwner.address);
    }

    {
      await distributor.connect(coverOwner)['submitClaim(uint256)'](444);
      const migrateCoverFromOwnerCalledWith = await cover.migrateCoverFromOwnerCalledWith();
      expect(migrateCoverFromOwnerCalledWith.coverId).to.be.equal(444);
      expect(migrateCoverFromOwnerCalledWith.fromOwner).to.be.equal(distributor.address);
      expect(migrateCoverFromOwnerCalledWith.toNewOwner).to.be.equal(coverOwner.address);
    }
  });

  it('reverts if the submission deposit is not sent', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await expect(
      claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](coverId, coverAmount, '', {
        value: ethers.constants.Zero,
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('reverts if a payout on the same cover can be redeemed ', async function () {
    const { cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
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
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
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

  it('reverts if covered product has a redeemMethod other than claim', async function () {
    const { cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      2, // productId of type yield token cover
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).to.be.revertedWith('Invalid redeem method');
    await cover.buyCover(
      coverOwner.address,
      1, // productId of type custodian cover
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await expect(submitClaim(this)({ coverId: 1, sender: coverOwner })).not.to.be.revertedWith('Invalid redeem method');
    await cover.buyCover(
      coverOwner.address,
      0, // productId of type protocol cover
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await expect(submitClaim(this)({ coverId: 2, sender: coverOwner })).not.to.be.revertedWith('Invalid redeem method');
  });

  it('allows to submit a new claim if an accepted claim is not redeemed during the redemption period', async function () {
    const { claims, cover, assessment } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    await submitClaim(this)({ coverId: 0, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    const { payoutCooldownInDays } = await assessment.config();
    const { payoutRedemptionPeriodInDays } = await claims.config();
    await setTime(poll.end + daysToSeconds(payoutCooldownInDays) + daysToSeconds(payoutRedemptionPeriodInDays));
    await expect(submitClaim(this)({ coverId: 0, sender: coverOwner })).not.to.be.reverted;
  });

  it('reverts if the submission deposit is less than the expected amount', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
    );
    const coverId = 0;

    const [deposit] = await claims.getAssessmentDepositAndReward(coverAmount, coverPeriod, payoutAsset);
    await expect(
      claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](coverId, coverAmount, '', {
        value: deposit.div('2'),
      }),
    ).to.be.revertedWith('Assessment deposit is insufficient');
  });

  it('refunds any excess ETH sent as a submission deposit', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;

    const [deposit] = await claims.getAssessmentDepositAndReward(coverAmount, coverPeriod, payoutAsset);

    {
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](0, coverAmount, '', {
        value: deposit.mul('2'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }

    {
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](1, coverAmount, '', {
        value: deposit.mul('3'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }

    {
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        coverAmount,
        coverPeriod,
        parseEther('2.6'),
        [],
      );
      const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
      await claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](2, coverAmount, '', {
        value: deposit.mul('10'),
        gasPrice: 0,
      });
      const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
      expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));
    }
  });

  it('reverts if the requested amount exceeds cover amount', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
    );
    const coverId = 0;

    const [deposit] = await claims.getAssessmentDepositAndReward(coverAmount, coverPeriod, payoutAsset);

    await expect(
      claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](coverId, coverAmount.add('1'), '', {
        value: deposit,
        gasPrice: 0,
      }),
    ).to.be.revertedWith('Covered amount exceeded');
  });

  it('reverts if the cover starts in the future', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;
    const latestBlock = await ethers.provider.getBlock('latest');
    const currentTime = latestBlock.timestamp;
    await cover.buyCoverAtDate(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
      currentTime + daysToSeconds(30),
    );
    const coverId = 0;

    const [deposit] = await claims.getAssessmentDepositAndReward(coverAmount, coverPeriod, payoutAsset);

    await expect(
      claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](coverId, coverAmount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover starts in the future');
  });

  it('reverts if the cover is outside the grace period', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;
    const { gracePeriodInDays } = await cover.productTypes(0);
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
    const currentTime = latestBlock.timestamp;
    await setTime(currentTime + coverPeriod + daysToSeconds(gracePeriodInDays) + 1);
    const coverId = 0;

    const [deposit] = await claims.getAssessmentDepositAndReward(coverAmount, coverPeriod, payoutAsset);

    await expect(
      claims.connect(coverOwner)['submitClaim(uint32,uint96,string)'](coverId, coverAmount, '', {
        value: deposit,
      }),
    ).to.be.revertedWith('Cover is outside the grace period');
  });

  it('calls startAssessment and stores the returned assessmentId in the claim', async function () {
    const { assessment, claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const coverPeriod = daysToSeconds(30);
    const coverAmount = parseEther('100');
    const payoutAsset = ASSET.ETH;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      coverAmount,
      coverPeriod,
      parseEther('2.6'),
      [],
    );

    const coverId = 0;

    const [expectedDeposit, expectedTotalReward] = await claims.getAssessmentDepositAndReward(
      coverAmount,
      coverPeriod,
      payoutAsset,
    );

    await claims
      .connect(coverOwner)
      ['submitClaim(uint32,uint96,string)'](coverId, coverAmount, '', { value: expectedDeposit });

    const expectedAssessmentId = 0;
    const { assessmentDeposit, totalReward } = await assessment.assessments(expectedAssessmentId);

    expect(assessmentDeposit).to.be.equal(expectedDeposit);
    expect(totalReward).to.be.equal(expectedTotalReward);

    const { assessmentId } = await claims.claims(0);
    expect(assessmentId).to.be.equal(expectedAssessmentId);
  });

  it('reverts if called by non-member address', async function () {
    const { coverNFT, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const [nonMemberOwner] = this.accounts.nonMembers;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    coverNFT.connect(coverOwner).transferFrom(coverOwner.address, nonMemberOwner.address, coverId);
    await expect(submitClaim(this)({ coverId, sender: nonMemberOwner })).to.be.reverted;
  });

  it('reverts if it is not called by cover owner or an approved address', async function () {
    const { cover, coverNFT } = this.contracts;
    const [coverOwner, otherMember] = this.accounts.members;

    {
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        parseEther('100'),
        daysToSeconds(30),
        parseEther('2.6'),
        [],
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
      await cover.buyCover(
        coverOwner.address,
        0, // productId
        ASSET.ETH,
        parseEther('100'),
        daysToSeconds(30),
        parseEther('2.6'),
        [],
      );
      const coverId = 1;
      await coverNFT.connect(coverOwner).approve(otherMember.address, coverId);
      await expect(submitClaim(this)({ coverId, sender: otherMember })).not.to.be.revertedWith(
        'Only the owner or approved addresses can submit a claim',
      );
    }
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not empty string', async function () {
    const { claims, cover } = this.contracts;
    const ipfsMetadata = 'ipfsProofHashMock';
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, ipfsMetadata, sender: coverOwner }))
      .to.emit(claims, 'MetadataSubmitted')
      .withArgs(0, ipfsMetadata);
  });

  it("doesn't emit MetadataSubmitted event if ipfsMetadata is an empty string", async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const coverId = 0;
    await expect(submitClaim(this)({ coverId, sender: coverOwner }))
      .not.to.emit(claims, 'MetadataSubmitted')
      .withArgs(0, '');
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const { claims, cover } = this.contracts;
    const [coverOwner] = this.accounts.members;
    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const firstCoverId = 0;

    {
      const [claimId, exists] = await claims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(this)({ coverId: firstCoverId, sender: coverOwner });
      const [claimId, exists] = await claims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    await cover.buyCover(
      coverOwner.address,
      0, // productId
      ASSET.ETH,
      parseEther('100'),
      daysToSeconds(30),
      parseEther('2.6'),
      [],
    );
    const secondCoverId = 1;

    {
      const [claimId, exists] = await claims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(this)({ coverId: secondCoverId, sender: coverOwner });
      const [claimId, exists] = await claims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.One);
    }
  });
});
