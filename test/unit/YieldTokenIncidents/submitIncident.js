const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('submitIncident', function () {
  it('reverts if the product uses a different claim method', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    {
      const productId = 0;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await expect(
        yieldTokenIncidents
          .connect(governance)
          .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), ''),
      ).to.be.revertedWith('Invalid claim method for this product type');
    }

    {
      const productId = 1;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await expect(
        yieldTokenIncidents
          .connect(governance)
          .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), ''),
      ).to.be.revertedWith('Invalid claim method for this product type');
    }
  });

  it('calls startAssessment and stores the returned assessmentId in the incident', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');
      const expectedAssessmentId = 0;
      const { assessmentId } = await yieldTokenIncidents.incidents(0);
      expect(assessmentId).to.be.equal(expectedAssessmentId);
    }

    {
      const productId = 2;
      const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
      await yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), '');
      const expectedAssessmentId = 1;
      const { assessmentId } = await yieldTokenIncidents.incidents(1);
      expect(assessmentId).to.be.equal(expectedAssessmentId);
    }
  });

  it('pushes an incident with productId, date and priceBefore to incidents', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const expectedProductId = 2;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const expectedPriceBefore = parseEther('1.1');
    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(expectedProductId, expectedPriceBefore, currentTime, parseEther('20000'), '');
    const { productId, date, priceBefore } = await yieldTokenIncidents.incidents(0);
    expect(productId).to.be.equal(expectedProductId);
    expect(date).to.be.equal(currentTime);
    expect(priceBefore).to.be.equal(expectedPriceBefore);
  });

  it('calculates the total reward using the expected payout amount parameter provided', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const productId = 2;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const expectedPayoutAmount = parseEther('100');
    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productId, parseEther('1.1'), currentTime, expectedPayoutAmount, '');
    const expectedTotalReward = expectedPayoutAmount.mul(fixture.config.rewardRatio).div(10000);
    const { totalRewardInNXM } = await assessment.assessments(0);
    expect(totalRewardInNXM).to.be.equal(expectedTotalReward);
  });

  it('calculates the totalRewardInNXM capped at config.maxRewardInNXMWad', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const productId = 2;

    await yieldTokenIncidents
      .connect(governance)
      .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('100000000'), '');
    const expectedTotalReward = parseEther(fixture.config.maxRewardInNXMWad.toString());

    const { totalRewardInNXM } = await assessment.assessments(0);
    expect(totalRewardInNXM).to.be.equal(expectedTotalReward);
  });

  it('emits MetadataSubmitted event with the provided ipfsMetadata when it is not empty string', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const productId = 2;

    await expect(
      yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('10000'), 'ipfsMetadata1'),
    )
      .to.emit(yieldTokenIncidents, 'MetadataSubmitted')
      .withArgs(0, 'ipfsMetadata1');

    await expect(
      yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.2'), currentTime, parseEther('20000'), 'ipfsMetadata2'),
    )
      .to.emit(yieldTokenIncidents, 'MetadataSubmitted')
      .withArgs(1, 'ipfsMetadata2');
  });

  it('emits IncidentSubmitted event with sender incident and product ids and payout in NXM', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    const productId = 2;

    await expect(
      yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('10000'), 'ipfsMetadata1'),
    )
      .to.emit(yieldTokenIncidents, 'IncidentSubmitted')
      .withArgs(governance.address, 0, productId, parseEther('10000'));

    await expect(
      yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.2'), currentTime, parseEther('20000'), 'ipfsMetadata2'),
    )
      .to.emit(yieldTokenIncidents, 'IncidentSubmitted')
      .withArgs(governance.address, 1, productId, parseEther('20000'));
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents, master } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    await master.pause();

    const productId = 2;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await expect(
      yieldTokenIncidents
        .connect(governance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), ''),
    ).to.be.revertedWith('System is paused');
  });

  it('reverts if caller is not advisory board', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [nonGovernance] = fixture.accounts.members;

    const productId = 2;
    const { timestamp: currentTime } = await ethers.provider.getBlock('latest');
    await expect(
      yieldTokenIncidents
        .connect(nonGovernance)
        .submitIncident(productId, parseEther('1.1'), currentTime, parseEther('20000'), ''),
    ).to.be.revertedWith('Caller is not authorized to govern');
  });
});
