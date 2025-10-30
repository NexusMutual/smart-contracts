const { ethers } = require('hardhat');
const { assert, expect } = require('chai');

const { submitClaim, ASSET, createMockCover } = require('./helpers');
const { mineNextBlock, setNextBlockTime, setEtherBalance, setNextBlockBaseFee } = require('../../utils/evm');
const { hex } = require('../../../lib/helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('submitClaim', function () {
  it('reverts if the submission deposit is not sent', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const coverId = 1;
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, parseEther('100'), ''),
    ).to.be.revertedWithCustomError(individualClaims, 'AssessmentDepositInsufficient');
  });

  it('reverts if a payout on the same cover can be redeemed ', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, individualClaims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);

    await setTime(poll.end + fixture.config.payoutCooldown);
    // await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      individualClaims,
      'PayoutCanStillBeRedeemed',
    );
  });

  it('reverts if a claim on the same cover is already being assessed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, individualClaims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      individualClaims,
      'ClaimIsBeingAssessed',
    );

    await assessment.castVote(0, true, parseEther('1'));
    const { poll } = await assessment.assessments(0);
    await setTime(poll.end + daysToSeconds(poll.end));
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.revertedWithCustomError(
      individualClaims,
      'ClaimIsBeingAssessed',
    );
  });

  // TODO: unable to currently test this with only one claim method existing, figure out if there's a workaround
  it.skip('reverts if covered product uses a claimMethod other than individual claims', async function () {
    const fixture = await loadFixture(setup);
    const { cover, individualClaims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, productId: 2 });

    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      individualClaims,
      'InvalidClaimMethod',
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, productId: 1, start: timestamp + 1 });

    await expect(submitClaim(fixture)({ coverId: 2, sender: coverOwner })).not.to.be.revertedWithCustomError(
      individualClaims,
      'InvalidClaimMethod',
    );

    const latestTimestamp = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, productId: 0, start: latestTimestamp.timestamp + 1 });

    await expect(submitClaim(fixture)({ coverId: 3, sender: coverOwner })).not.to.be.revertedWith(
      'Invalid redeem method',
    );
  });

  it('allows claim submission if an accepted claim is not redeemed during the redemption period', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });
    await assessment.castVote(0, true, parseEther('1'));

    const { poll } = await assessment.assessments(0);
    const { payoutCooldown, payoutRedemptionPeriod } = fixture.config;

    await setTime(poll.end + payoutCooldown + payoutRedemptionPeriod);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });

  it('reverts if the submission deposit is less than the expected amount', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', {
        value: deposit.div('2'),
      }),
    ).to.be.revertedWithCustomError(individualClaims, 'AssessmentDepositInsufficient');
  });

  it('refunds any excess ETH sent as a submission deposit', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    const balanceBefore = await ethers.provider.getBalance(coverOwner.address);
    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(coverOwner)
      .submitClaim(1, coverData.amount, '', { value: deposit.mul('2'), gasPrice: 0 });

    const balanceAfter = await ethers.provider.getBalance(coverOwner.address);
    expect(balanceAfter).to.be.equal(balanceBefore.sub(deposit));

    const { timestamp } = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, start: timestamp + 1 });

    const coverId2 = 2;
    const coverData2 = await cover.getCoverData(coverId2);
    const balanceBefore2 = await ethers.provider.getBalance(coverOwner.address);
    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(coverOwner)
      .submitClaim(coverId2, coverData2.amount, '', { value: deposit.mul('3'), gasPrice: 0 });

    const balanceAfter2 = await ethers.provider.getBalance(coverOwner.address);
    expect(balanceAfter2).to.be.equal(balanceBefore2.sub(deposit));

    const latestTimestamp = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, start: latestTimestamp.timestamp + 1 });

    const coverId3 = 3;
    const coverData3 = await cover.getCoverData(coverId3);
    const balanceBefore3 = await ethers.provider.getBalance(coverOwner.address);
    await setNextBlockBaseFee('0');
    await individualClaims
      .connect(coverOwner)
      .submitClaim(coverId3, coverData3.amount, '', { value: deposit.mul('10'), gasPrice: 0 });

    const balanceAfter3 = await ethers.provider.getBalance(coverOwner.address);
    expect(balanceAfter3).to.be.equal(balanceBefore3.sub(deposit));
  });

  it('reverts if the requested amount exceeds cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100') });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount.add(1), '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'CoveredAmountExceeded');
  });

  it('reverts if the claim submission is made in the same block as the cover purchase', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const start = timestamp + 10;

    await createMockCover(cover, { owner: coverOwner.address, start });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    await setNextBlockTime(start);
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'CantBuyCoverAndClaimInTheSameBlock');
  });

  it('reverts if the cover is outside the grace period', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, coverProducts } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;
    const { gracePeriod } = await coverProducts.getProductType(0);

    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + gracePeriod + 1); // advance time past grace period

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).not.to.be.revertedWithCustomError(individualClaims, 'GracePeriodPassed');

    // advance time past grace period
    await setTime(coverData.start + coverData.period + gracePeriod + 1);

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'GracePeriodPassed');
  });

  it('Assessment should use cover grace period and not product.gracePeriod', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, coverProducts } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const [boardMember] = fixture.accounts.advisoryBoardMembers;

    const coverAsset = ASSET.ETH;
    const { gracePeriod } = await coverProducts.getProductType(0);

    // create a cover using the default grace period
    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const longerGracePeriod = gracePeriod * 100;
    await coverProducts.connect(boardMember).editProductTypes([0], [longerGracePeriod], ['ipfs hash']);

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + 30 * 24 * 3600 + gracePeriod + 1); // move time past grace period

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'GracePeriodPassed');
  });

  it('calls startAssessment and stores the returned assessmentId in the claim', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const [expectedDeposit, expectedTotalReward] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    await individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: expectedDeposit });

    const expectedAssessmentId = 0;
    const { assessmentDepositInETH, totalRewardInNXM } = await assessment.assessments(expectedAssessmentId);

    expect(assessmentDepositInETH).to.be.equal(expectedDeposit);
    expect(totalRewardInNXM).to.be.equal(expectedTotalReward);

    const { assessmentId } = await individualClaims.claims(0);
    expect(assessmentId).to.be.equal(expectedAssessmentId);
  });

  it('reverts if called by non-member address', async function () {
    const fixture = await loadFixture(setup);
    const { coverNFT, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const [nonMemberOwner] = fixture.accounts.nonMembers;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    coverNFT.connect(coverOwner).transferFrom(coverOwner.address, nonMemberOwner.address, coverId);
    await expect(submitClaim(fixture)({ coverId, sender: nonMemberOwner })).to.be.revertedWith(
      'Caller is not a member',
    );
  });

  it('reverts if it is not called by cover owner or an approved address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, individualClaims } = fixture.contracts;
    const [coverOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    await expect(submitClaim(fixture)({ coverId, sender: otherMember })).to.be.revertedWithCustomError(
      individualClaims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );
    await expect(submitClaim(fixture)({ coverId, sender: coverOwner })).not.to.be.revertedWithCustomError(
      individualClaims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, start: timestamp + 1 });

    const coverId2 = 2;
    await coverNFT.connect(coverOwner).approve(otherMember.address, coverId2);
    await expect(submitClaim(fixture)({ coverId: coverId2, sender: otherMember })).not.to.be.revertedWithCustomError(
      individualClaims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not an empty string', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const ipfsMetadata = 'ipfsProofHashMock';
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    await expect(submitClaim(fixture)({ coverId, ipfsMetadata, sender: coverOwner }))
      .to.emit(individualClaims, 'MetadataSubmitted')
      .withArgs(0, ipfsMetadata);
  });

  it("doesn't emit MetadataSubmitted event if ipfsMetadata is an empty string", async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    await expect(submitClaim(fixture)({ coverId, sender: coverOwner })).not.to.emit(
      individualClaims,
      'MetadataSubmitted',
    );
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const firstCoverId = 1;

    {
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(fixture)({ coverId: firstCoverId, sender: coverOwner });
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(firstCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    await createMockCover(cover, { owner: coverOwner.address });

    const secondCoverId = 2;

    {
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, false);
      expect(claimId).to.be.equal(ethers.constants.Zero);
    }

    {
      await submitClaim(fixture)({ coverId: secondCoverId, sender: coverOwner });
      const [claimId, exists] = await individualClaims.lastClaimSubmissionOnCover(secondCoverId);
      assert.equal(exists, true);
      expect(claimId).to.be.equal(ethers.constants.One);
    }
  });

  it('reverts if the system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, master } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await master.pause();

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.ETH,
    );
    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWith('System is paused');
  });

  it('Should revert if the sender is not the NFT owner or an approved contract', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner, coverNonOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.ETH,
    );
    await expect(
      individualClaims.connect(coverNonOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'OnlyOwnerOrApprovedCanSubmitClaim');
  });

  it('Should transfer assessment deposit to pool', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, pool } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const balanceBefore = await ethers.provider.getBalance(pool.address);

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.ETH,
    );
    await individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit });
    await expect(await ethers.provider.getBalance(pool.address)).to.be.equal(balanceBefore.add(deposit));
  });

  it('Should emit ClaimSubmitted event', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      ASSET.ETH,
    );
    await expect(individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }))
      .to.emit(individualClaims, 'ClaimSubmitted')
      .withArgs(coverOwner.address, 0, coverId, 0);
  });

  it('should revert if ETH refund fails', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, memberRoles, cover, nxm: fallbackWillFailContract } = fixture.contracts;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: fallbackWillFailContract.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    const fallbackWillFailSigner = await ethers.getImpersonatedSigner(fallbackWillFailContract.address);

    await memberRoles.setRole(fallbackWillFailSigner.address, 2);

    await setEtherBalance(fallbackWillFailSigner.address, ethers.utils.parseEther('1'));

    await expect(
      individualClaims
        .connect(fallbackWillFailSigner)
        .submitClaim(coverId, coverData.amount, '', { value: deposit.mul('2') }),
    ).to.be.revertedWithCustomError(individualClaims, 'AssessmentDepositTrasnferRefundFailed');
  });

  it('should revert if assessment deposit to pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { individualClaims, cover, master } = fixture.contracts;
    const coverAsset = ASSET.ETH;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);
    const [deposit] = await individualClaims.getAssessmentDepositAndReward(
      coverData.amount,
      coverData.period,
      coverAsset,
    );

    const PoolEtherRejecterMock = await ethers.getContractFactory('PoolEtherRejecterMock');

    const fallbackWillFailContractPool = await PoolEtherRejecterMock.deploy();
    await fallbackWillFailContractPool.setTokenPrice(ASSET.ETH, parseEther('0.0382'));
    await master.setLatestAddress(hex('P1'), fallbackWillFailContractPool.address);
    await individualClaims.changeDependentContractAddress();

    await expect(
      individualClaims.connect(coverOwner).submitClaim(coverId, coverData.amount, '', { value: deposit }),
    ).to.be.revertedWithCustomError(individualClaims, 'AssessmentDepositTransferToPoolFailed');
  });
});
