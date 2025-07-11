const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setEtherBalance, impersonateAccount } = require('../../utils/evm');

describe('startAssessment', function () {
  it('should revert if assessment already exists for the claim', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { CLAIM_ID, PRODUCT_TYPE_ID } = constants;

    // Impersonate the Claims contract to call startAssessment
    await impersonateAccount(claims.address);
    await setEtherBalance(claims.address, ethers.utils.parseEther('1'));
    const claimsSigner = await ethers.getSigner(claims.address);

    // Try to start an assessment for a claim that already has one (CLAIM_ID = 1 from setup)
    await expect(
      assessment.connect(claimsSigner).startAssessment(CLAIM_ID, PRODUCT_TYPE_ID),
    ).to.be.revertedWithCustomError(assessment, 'AssessmentAlreadyExists');
  });

  it('should revert if the product type is invalid', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const invalidProductTypeId = 999;
    const claimId = 2;

    // Impersonate the Claims contract to call startAssessment
    await impersonateAccount(claims.address);
    await setEtherBalance(claims.address, ethers.utils.parseEther('1'));
    const claimsSigner = await ethers.getSigner(claims.address);

    // Try to start an assessment with invalid product type
    await expect(
      assessment.connect(claimsSigner).startAssessment(claimId, invalidProductTypeId),
    ).to.be.revertedWithCustomError(assessment, 'InvalidProductType');
  });

  it('should revert when called by non-Claims contract', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment } = contracts;
    const { CLAIM_ID, PRODUCT_TYPE_ID } = constants;
    const [randomAccount] = accounts.members;

    await expect(
      assessment.connect(randomAccount).startAssessment(CLAIM_ID + 1, PRODUCT_TYPE_ID),
    ).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should correctly start assessment with valid parameters', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { CLAIM_ID, PRODUCT_TYPE_ID } = constants;
    const expectedClaimId = CLAIM_ID + 1;

    // Impersonate the Claims contract to call startAssessment
    await impersonateAccount(claims.address);
    await setEtherBalance(claims.address, ethers.utils.parseEther('1'));
    const claimsSigner = await ethers.getSigner(claims.address);

    const tx = await assessment.connect(claimsSigner).startAssessment(expectedClaimId, PRODUCT_TYPE_ID);

    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    const votingPeriod = await assessment.votingPeriod();
    const expectedVotingEnd = block.timestamp + votingPeriod.toNumber();

    // Verify event emission with correct parameters
    await expect(tx)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(expectedClaimId, constants.ASSESSOR_GROUP_ID, block.timestamp, expectedVotingEnd);

    // Verify the assessment was created by checking the assessor group ID
    const { assessingGroupId: assessorGroupId } = await assessment.getAssessment(expectedClaimId);
    expect(assessorGroupId).to.equal(constants.ASSESSOR_GROUP_ID);

    // Verify all assessment fields are set correctly
    const assessmentData = await assessment.getAssessment(expectedClaimId);
    expect(assessmentData.assessingGroupId).to.equal(constants.ASSESSOR_GROUP_ID);
    expect(assessmentData.start).to.equal(block.timestamp);
    expect(assessmentData.votingEnd).to.equal(expectedVotingEnd);
    expect(assessmentData.votingEnd).to.be.gt(assessmentData.start);
    expect(assessmentData.votingEnd - assessmentData.start).to.equal(votingPeriod);
    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(0);

    const expectedCooldownPeriod = await assessment.payoutCooldown(PRODUCT_TYPE_ID);
    expect(assessmentData.cooldownPeriod).to.equal(expectedCooldownPeriod);
  });

  it('should handle different product types with different cooldown periods', async function () {
    const { contracts, accounts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { CLAIM_ID, ASSESSOR_GROUP_ID } = constants;
    const [governanceAccount] = accounts.governanceContracts;

    // Impersonate the Claims contract
    await impersonateAccount(claims.address);
    await setEtherBalance(claims.address, ethers.utils.parseEther('1'));
    const claimsSigner = await ethers.getSigner(claims.address);

    // Set up different product types with different cooldown periods
    const productType1 = 100;
    const productType2 = 101;
    const cooldown1 = 7 * 24 * 60 * 60; // 7 days
    const cooldown2 = 14 * 24 * 60 * 60; // 14 days

    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes([productType1], cooldown1, ASSESSOR_GROUP_ID);
    await assessment
      .connect(governanceAccount)
      .setAssessmentDataForProductTypes([productType2], cooldown2, ASSESSOR_GROUP_ID);

    // Start assessments for both product types
    const claimId1 = CLAIM_ID + 1;
    const claimId2 = CLAIM_ID + 2;

    const tx1 = await assessment.connect(claimsSigner).startAssessment(claimId1, productType1);
    const tx2 = await assessment.connect(claimsSigner).startAssessment(claimId2, productType2);

    // Verify assessments have correct cooldown periods
    const assessment1 = await assessment.getAssessment(claimId1);
    const assessment2 = await assessment.getAssessment(claimId2);

    expect(assessment1.cooldownPeriod).to.equal(cooldown1);
    expect(assessment2.cooldownPeriod).to.equal(cooldown2);

    // Verify both use the same assessor group
    expect(assessment1.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    expect(assessment2.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    // Verify events are emitted correctly
    const { blockNumber: blockNumber1 } = await tx1.wait();
    const { blockNumber: blockNumber2 } = await tx2.wait();
    const block1 = await ethers.provider.getBlock(blockNumber1);
    const block2 = await ethers.provider.getBlock(blockNumber2);
    const votingPeriod = await assessment.votingPeriod();

    await expect(tx1)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(claimId1, ASSESSOR_GROUP_ID, block1.timestamp, block1.timestamp + votingPeriod.toNumber());

    await expect(tx2)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(claimId2, ASSESSOR_GROUP_ID, block2.timestamp, block2.timestamp + votingPeriod.toNumber());
  });
});
