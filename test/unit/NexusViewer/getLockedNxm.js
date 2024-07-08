const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('getLockedNxm', function () {
  const tokenIds = [2, 31, 38, 86];

  it('should return aggregatedTokens and 0 assessmentStake if user has NO stake locked', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, nexusViewer } = fixture.contracts;

    // no stake locked
    await assessmentViewer.setStakeLocked(false);

    const { aggregatedTokens, assessmentStakeAmount } = await nexusViewer.getLockedNxm(member.address, tokenIds);
    expect(aggregatedTokens.totalActiveStake).to.be.equal(parseEther('10'));
    expect(aggregatedTokens.totalExpiredStake).to.be.equal(parseEther('10'));
    expect(aggregatedTokens.totalRewards).to.be.equal(parseEther('10'));
    expect(assessmentStakeAmount.toString()).to.be.equal('0');
  });

  it('should return aggregatedTokens and assessmentStake amount if user has stake locked', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessment, assessmentViewer, nexusViewer } = fixture.contracts;

    // has stake locked
    const lockedStake = parseEther('111111');
    await assessmentViewer.setStakeLocked(true);
    await assessment.setStakeOf(member.address, lockedStake, 0, 0);

    const { aggregatedTokens, assessmentStakeAmount } = await nexusViewer.getLockedNxm(member.address, tokenIds);
    expect(aggregatedTokens.totalActiveStake).to.be.equal(parseEther('10'));
    expect(aggregatedTokens.totalExpiredStake).to.be.equal(parseEther('10'));
    expect(aggregatedTokens.totalRewards).to.be.equal(parseEther('10'));
    expect(assessmentStakeAmount).to.be.equal(lockedStake);
  });
});
