const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../utils').evm;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('getStakeLocked', function () {
  it('should return false if user has 0 vote count in assessment', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer } = fixture.contracts;

    const { isStakeLocked, stakeLockupExpiry } = await assessmentViewer.getStakeLocked(member.address);

    expect(isStakeLocked).to.equal(false);
    expect(stakeLockupExpiry).to.equal(0);
  });

  it('should return false if assessment lockup expiry has passed', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, assessment } = fixture.contracts;
    const { stakeLockupPeriod } = fixture.config;

    await assessment.setVotesOf(member.address, '10', 0, true);

    const { isStakeLocked: isStakeLockedBefore, stakeLockupExpiry: stakeLockupExpiryBefore } =
      await assessmentViewer.getStakeLocked(member.address);

    const { timestamp } = await ethers.provider.getBlock('latest');

    expect(isStakeLockedBefore).to.equal(true);
    expect(stakeLockupExpiryBefore).to.equal(timestamp + stakeLockupPeriod);

    // advance time so that assessment lockup expires
    await setTime(timestamp + stakeLockupPeriod + 1);

    const { isStakeLocked: isStakeLockedAfter, stakeLockupExpiry: stakeLockupExpiryAfter } =
      await assessmentViewer.getStakeLocked(member.address);

    expect(isStakeLockedAfter).to.equal(false);
    expect(stakeLockupExpiryAfter).to.equal(timestamp + stakeLockupPeriod);
  });

  it('should return true if assessment lockup expiry has not passed', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, assessment } = fixture.contracts;

    await assessment.setVotesOf(member.address, '10', 0, true);

    const { isStakeLocked, stakeLockupExpiry } = await assessmentViewer.getStakeLocked(member.address);

    expect(isStakeLocked).to.equal(true);
    expect(stakeLockupExpiry).to.not.equal(0);
  });
});
