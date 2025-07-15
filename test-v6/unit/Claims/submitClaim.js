const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { parseEther, toBeHex } = ethers;

const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { C_POOL } = require('../../utils/registry')
const { ASSET, ASSESSMENT_STATUS, createMockCover, submitClaim } = require('./helpers');
const { setup } = require('./setup');

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('submitClaim', function () {

  it('reverts if sender is not a member', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;
    await expect(
      claims.connect(nonMember).submitClaim(1, parseEther('100'), toBeHex(0, 32)),
    ).to.be.revertedWithCustomError(claims, 'OnlyMember');
  });

  it('reverts if sender is not a cover owner or an approved address', async function () {
    const fixture = await loadFixture(setup);
    const { cover, coverNFT, claims } = fixture.contracts;
    const [coverOwner, otherMember] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    await expect(submitClaim(fixture)({ coverId, sender: otherMember })).to.be.revertedWithCustomError(
      claims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );
    await expect(submitClaim(fixture)({ coverId, sender: coverOwner })).not.to.be.revertedWithCustomError(
      claims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );

    const { timestamp } = await ethers.provider.getBlock('latest');
    await createMockCover(cover, { owner: coverOwner.address, start: timestamp + 1 });

    const coverId2 = 2;
    await coverNFT.connect(coverOwner).approve(otherMember.address, coverId2);
    await expect(submitClaim(fixture)({ coverId: coverId2, sender: otherMember })).not.to.be.revertedWithCustomError(
      claims,
      'OnlyOwnerOrApprovedCanSubmitClaim',
    );
  });

  it('reverts if sender is not a cover owner', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const [coverOwner, notOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const coverId = 1;
    await expect(
      claims.connect(notOwner).submitClaim(coverId, parseEther('100'), toBeHex(0, 32)),
    ).to.be.revertedWithCustomError(claims, 'OnlyOwnerOrApprovedCanSubmitClaim');
  });

  it('reverts if a claim on the same cover is already being assessed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    const { timestamp } = await ethers.provider.getBlock('latest');

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.VOTING);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'ClaimIsBeingAssessed',
    );

    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.COOLDOWN);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'ClaimIsBeingAssessed',
    );
  });

  it('reverts if a payout on the same cover can be redeemed', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);

    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).to.be.revertedWithCustomError(
      claims,
      'PayoutCanStillBeRedeemed',
    );
  });

  it('allows claim submission if an accepted claim is not redeemed during the redemption period', async function () {
    const fixture = await loadFixture(setup);
    const { cover, assessment, claims } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    
    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId: 1, sender: coverOwner });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await assessment.setAssessmentResult(claimId, timestamp, ASSESSMENT_STATUS.ACCEPTED);
    const { payoutRedemptionPeriod } = fixture.config;

    await setTime(timestamp + payoutRedemptionPeriod);
    await expect(submitClaim(fixture)({ coverId: 1, sender: coverOwner })).not.to.be.reverted;
  });

  it('reverts if the submission deposit is not an exact amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });
    const coverId = 1;

    // not sending deposit
    await expect(
      claims.connect(coverOwner).submitClaim(coverId, parseEther('100'), toBeHex(0, 32)),
    ).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');

    // sending less than expected
    await expect(
      claims.connect(coverOwner).submitClaim(coverId, parseEther('100'), toBeHex(0, 32), { value: deposit - 1n }),
    ).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');

    // sending more than expected
    await expect(
      claims.connect(coverOwner).submitClaim(coverId, parseEther('100'), toBeHex(0, 32), { value: deposit + 1n }),
    ).to.be.revertedWithCustomError(claims, 'AssessmentDepositNotExact');
  });

  it('reverts if the requested amount exceeds cover amount', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, amount: parseEther('100') });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    await expect(
      claims.connect(coverOwner).submitClaim(coverId, coverData.amount + 1n, toBeHex(0, 32), { value: deposit }),
    ).to.be.revertedWithCustomError(claims, 'CoveredAmountExceeded');
  });

  it('reverts if the claim submission is made in the same block as the cover purchase', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const start = timestamp + 10;

    await createMockCover(cover, { owner: coverOwner.address, start });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    await setNextBlockTime(start);
    await expect(
      claims.connect(coverOwner).submitClaim(coverId, coverData.amount, toBeHex(0, 32), { value: deposit }),
    ).to.be.revertedWithCustomError(claims, 'CantBuyCoverAndClaimInTheSameBlock');
  });

  it('reverts if the cover is outside the grace period', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverProducts } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;
    const { gracePeriod } = await coverProducts.getProductType(0);

    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const { timestamp } = await ethers.provider.getBlock('latest');

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // advance time past grace period
    await setTime(timestamp + Number(coverData.start) + Number(coverData.period) + Number(gracePeriod) + 1);

    await expect(
      submitClaim(fixture)({ coverId, sender: coverOwner })
    ).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('Assessment should use cover grace period and not product.gracePeriod', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, coverProducts } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;
    const [boardMember] = fixture.accounts.advisoryBoardMembers;
    const { gracePeriod } = await coverProducts.getProductType(0);

    // create a cover using the default grace period
    await createMockCover(cover, { owner: coverOwner.address, gracePeriod });

    const longerGracePeriod = gracePeriod * 100n;
    await coverProducts.connect(boardMember).editProductTypes([0], [longerGracePeriod], ['ipfs hash']);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    // advance time past grace period
    await setTime(timestamp + Number(coverData.start) + Number(coverData.period) + Number(gracePeriod) + 1);

    await expect(
      submitClaim(fixture)({ coverId, sender: coverOwner })
    ).to.be.revertedWithCustomError(claims, 'GracePeriodPassed');
  });

  it('calls startAssessment with the right productTypeId', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;
    const coverAsset = ASSET.ETH;

    await createMockCover(cover, { owner: coverOwner.address, productId: 1 });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const claimId = await claims.getClaimsCount() + 1n;
    await submitClaim(fixture)({ coverId, sender: coverOwner });

    expect(await assessment._productTypeForClaimId(claimId)).to.equal(1n);
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not an empty bytes', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const ipfsMetadata = toBeHex(5, 32);
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    await expect(submitClaim(fixture)({ coverId: 1, ipfsMetadata, sender: coverOwner }))
      .to.emit(claims, 'MetadataSubmitted')
      .withArgs(1, ipfsMetadata);

    await createMockCover(cover, { owner: coverOwner.address });

    // does not emit event if ipfsMetadata is empty
    await expect(submitClaim(fixture)({ coverId: 2, sender: coverOwner })).not.to.emit(
      claims,
      'MetadataSubmitted',
    );
  });

  it('stores the claimId in lastClaimSubmissionOnCover', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const firstCoverId = 1;

    {
      const claimId = await claims.lastClaimSubmissionOnCover(firstCoverId);
      expect(claimId).to.be.equal(0n);
    }

    {
      await submitClaim(fixture)({ coverId: firstCoverId, sender: coverOwner });
      const claimId = await claims.lastClaimSubmissionOnCover(firstCoverId);
      expect(claimId).to.be.equal(1n);
    }

    await createMockCover(cover, { owner: coverOwner.address });

    const secondCoverId = 2;

    {
      const claimId = await claims.lastClaimSubmissionOnCover(secondCoverId);
      expect(claimId).to.be.equal(0n);
    }

    {
      await submitClaim(fixture)({ coverId: secondCoverId, sender: coverOwner });
      const claimId = await claims.lastClaimSubmissionOnCover(secondCoverId);
      expect(claimId).to.be.equal(2n);
    }
  });

  it('should transfer assessment deposit to pool', async function () {
    const fixture = await loadFixture(setup);
    const { cover, pool } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    const poolAddress = await pool.getAddress();

    await createMockCover(cover, { owner: coverOwner.address });

    const balanceBefore = await ethers.provider.getBalance(poolAddress);

    const coverId = 1;
    await submitClaim(fixture)({ coverId, sender: coverOwner });
    expect(await ethers.provider.getBalance(poolAddress)).to.equal(balanceBefore + deposit);
  });

  it('should emit ClaimSubmitted event', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address, productId: 2 });

    const coverId = 1;

    await expect(submitClaim(fixture)({ coverId, sender: coverOwner }))
      .to.emit(claims, 'ClaimSubmitted')
      .withArgs(coverOwner.address, 1, coverId, 2);
  });

  it('should revert if assessment deposit to pool fails', async function () {
    const fixture = await loadFixture(setup);
    const { claims, cover, registry } = fixture.contracts;
    const { claimDepositInETH: deposit } = fixture.config;
    const [coverOwner] = fixture.accounts.members;

    await createMockCover(cover, { owner: coverOwner.address });

    const coverId = 1;
    const coverData = await cover.getCoverData(coverId);

    const PoolEtherRejecterMock = await ethers.getContractFactory('PoolEtherRejecterMock');

    const fallbackWillFailContractPool = await PoolEtherRejecterMock.deploy();
    await fallbackWillFailContractPool.setTokenPrice(ASSET.ETH, parseEther('0.0382'));
    await registry.addContract(C_POOL, await fallbackWillFailContractPool.getAddress(), false);

    await expect(
      claims.connect(coverOwner).submitClaim(coverId, coverData.amount, toBeHex(0, 32), { value: deposit }),
    ).to.be.revertedWithCustomError(claims, 'AssessmentDepositTransferToPoolFailed');
  });
});
