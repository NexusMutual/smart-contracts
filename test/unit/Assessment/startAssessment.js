const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { setup } = require('./setup');
const { impersonateAccount } = require('../../utils/evm');

describe('startAssessment', function () {
  const COOLDOWN_PERIOD = 24 * 60 * 60;

  it('should revert when called by non-Claims contract', async function () {
    const { contracts, accounts } = await loadFixture(setup);
    const { assessment } = contracts;
    const [nonClaims] = accounts.members;

    const claimId = 999; // Use different claimId
    const PRODUCT_TYPE_ID = 1;

    const startAssessment = assessment.connect(nonClaims).startAssessment(claimId, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);
    await expect(startAssessment).to.be.revertedWithCustomError(assessment, 'Unauthorized');
  });

  it('should revert when assessment data is not set for product type', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment, claims } = contracts;

    const claimId = 998; // Use different claimId
    const UNKNOWN_PRODUCT_TYPE_ID = 999;

    const claimsAddress = await claims.getAddress();
    await impersonateAccount(claimsAddress);
    const claimsSigner = await ethers.getSigner(claimsAddress);

    const startAssessment = assessment
      .connect(claimsSigner)
      .startAssessment(claimId, UNKNOWN_PRODUCT_TYPE_ID, COOLDOWN_PERIOD);
    await expect(startAssessment).to.be.revertedWithCustomError(assessment, 'InvalidProductType');
  });

  it('should revert when assessment already exists', async function () {
    const { contracts } = await loadFixture(setup);
    const { assessment, claims } = contracts;

    const claimId = 997; // Use different claimId
    const PRODUCT_TYPE_ID = 1;

    const claimsAddress = await claims.getAddress();
    await impersonateAccount(claimsAddress);
    const claimsSigner = await ethers.getSigner(claimsAddress);

    // Start assessment first time
    await assessment.connect(claimsSigner).startAssessment(claimId, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);

    // Try to start assessment again with same claimId
    const startAssessmentAgain = assessment
      .connect(claimsSigner)
      .startAssessment(claimId, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);
    await expect(startAssessmentAgain).to.be.revertedWithCustomError(assessment, 'AssessmentAlreadyExists');
  });

  it('should successfully start assessment with correct parameters', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;

    const expectedClaimId = 996; // Use different claimId
    const PRODUCT_TYPE_ID = 1;

    const claimsAddress = await claims.getAddress();
    await impersonateAccount(claimsAddress);
    const claimsSigner = await ethers.getSigner(claimsAddress);

    const tx = await assessment
      .connect(claimsSigner)
      .startAssessment(expectedClaimId, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);

    const { blockNumber } = await tx.wait();
    const block = await ethers.provider.getBlock(blockNumber);
    if (!block) {
      throw new Error('Block not found');
    }

    // Fetch voting period and assessment data in parallel
    const [expectedVotingPeriod, assessmentData] = await Promise.all([
      assessment.minVotingPeriod(),
      assessment.getAssessment(expectedClaimId),
    ]);

    const expectedVotingEnd = BigInt(block.timestamp) + expectedVotingPeriod;

    // Verify event emission with correct parameters
    await expect(tx)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(expectedClaimId, constants.ASSESSOR_GROUP_ID, block.timestamp, expectedVotingEnd);

    // Verify the assessment was created by checking the assessor group ID
    const { assessingGroupId: assessorGroupId } = assessmentData;
    expect(assessorGroupId).to.equal(constants.ASSESSOR_GROUP_ID);

    // Verify all assessment fields are set correctly
    expect(assessmentData.assessingGroupId).to.equal(constants.ASSESSOR_GROUP_ID);
    expect(assessmentData.start).to.equal(block.timestamp);
    expect(assessmentData.votingEnd).to.equal(expectedVotingEnd);
    expect(assessmentData.acceptVotes).to.equal(0);
    expect(assessmentData.denyVotes).to.equal(0);
    expect(assessmentData.cooldownPeriod).to.be.greaterThan(0);
  });

  it('should handle multiple assessments with different claim IDs', async function () {
    const { contracts, constants } = await loadFixture(setup);
    const { assessment, claims } = contracts;
    const { ASSESSOR_GROUP_ID } = constants;

    const claimId1 = 995; // Use different claimIds
    const claimId2 = 994;
    const PRODUCT_TYPE_ID = 1;

    const claimsAddress = await claims.getAddress();
    await impersonateAccount(claimsAddress);
    const claimsSigner = await ethers.getSigner(claimsAddress);

    const tx1 = await assessment.connect(claimsSigner).startAssessment(claimId1, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);
    const tx2 = await assessment.connect(claimsSigner).startAssessment(claimId2, PRODUCT_TYPE_ID, COOLDOWN_PERIOD);

    // Verify both assessments were created in parallel
    const [assessment1, assessment2] = await Promise.all([
      assessment.getAssessment(claimId1),
      assessment.getAssessment(claimId2),
    ]);

    expect(assessment1.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);
    expect(assessment2.assessingGroupId).to.equal(ASSESSOR_GROUP_ID);

    // Verify assessments are independent
    expect(assessment1.start).to.not.equal(assessment2.start);

    // Verify events are emitted correctly
    const [{ blockNumber: blockNumber1 }, { blockNumber: blockNumber2 }] = await Promise.all([tx1.wait(), tx2.wait()]);

    const [block1, block2] = await Promise.all([
      ethers.provider.getBlock(blockNumber1),
      ethers.provider.getBlock(blockNumber2),
    ]);

    if (!block1 || !block2) {
      throw new Error('Block not found');
    }

    // Expected voting period from assessment contract
    const votingPeriod = await assessment.minVotingPeriod();

    await expect(tx1)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(claimId1, ASSESSOR_GROUP_ID, block1.timestamp, BigInt(block1.timestamp) + votingPeriod);

    await expect(tx2)
      .to.emit(assessment, 'AssessmentStarted')
      .withArgs(claimId2, ASSESSOR_GROUP_ID, block2.timestamp, BigInt(block2.timestamp) + votingPeriod);
  });
});
