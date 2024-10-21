const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('getStakedNXM', function () {
  const tokenIds = [2, 31, 38, 86];

  it('should return aggregatedTokens and 0 assessmentStake if user has NO stake locked', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, nexusViewer, stakingViewer } = fixture.contracts;

    // no stake locked
    const totalActiveStake = parseEther('10');
    await assessmentViewer.setStakeLocked({
      isStakeLocked: false,
      stakeLockupExpiry: 0,
    });
    await stakingViewer.setAggregatedTokens(totalActiveStake, parseEther('5'), parseEther('5'));

    const stakedNXM = await nexusViewer.getStakedNXM(member.address, tokenIds);

    expect(stakedNXM.stakingPoolTotalActiveStake).to.be.equal(totalActiveStake);
    expect(stakedNXM.assessmentStake).to.be.equal('0');
    expect(stakedNXM.assessmentRewards.toString()).to.be.equal('0');
    expect(stakedNXM.assessmentStakeLockupExpiry).to.be.equal(0);
  });

  it('should return aggregatedTokens and assessmentStake amount if user has stake locked', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessment, assessmentViewer, nexusViewer, stakingViewer } = fixture.contracts;

    // has stake locked
    const totalActiveStake = parseEther('10');
    const lockedStake = parseEther('111111');
    const { timestamp } = await ethers.provider.getBlock('latest');
    const stakeLockupExpiry = timestamp + 1;
    await assessmentViewer.setStakeLocked({
      isStakeLocked: true,
      stakeLockupExpiry,
    });
    await assessment.setStakeOf(member.address, lockedStake, 0, 0);
    await stakingViewer.setAggregatedTokens(totalActiveStake, parseEther('5'), parseEther('5'));

    const stakedNXM = await nexusViewer.getStakedNXM(member.address, tokenIds);

    expect(stakedNXM.stakingPoolTotalActiveStake).to.be.equal(totalActiveStake);
    expect(stakedNXM.assessmentStake).to.be.equal(lockedStake);
    expect(stakedNXM.assessmentRewards.toString()).to.be.equal('0');
    expect(stakedNXM.assessmentStakeLockupExpiry).to.be.equal(stakeLockupExpiry);
  });

  it('should return assessmentRewards correctly', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, nexusViewer } = fixture.contracts;

    const totalPendingAmountInNXM = parseEther('10');
    const withdrawableAmountInNXM = parseEther('5');
    const expectedAssessmentRewards = totalPendingAmountInNXM.sub(withdrawableAmountInNXM);

    await assessmentViewer.setRewards(totalPendingAmountInNXM, withdrawableAmountInNXM, 0);

    const stakedNXM = await nexusViewer.getStakedNXM(member.address, tokenIds);
    expect(stakedNXM.assessmentRewards).to.equal(expectedAssessmentRewards);
  });
});
