const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../utils').evm;

const setTime = async timestamp => {
  await setNextBlockTime(timestamp);
  await mineNextBlock();
};

describe('isStakeLocked', function () {
  const ONE_DAY_SECONDS = 24 * 60 * 60;

  it('should return false if user has 0 vote count in assessment', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer } = fixture.contracts;

    expect(await assessmentViewer.isStakeLocked(member.address)).to.equal(false);
  });

  it('should return false if assessment lockup expiry has passed', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, assessment } = fixture.contracts;
    const { stakeLockupPeriodInDays } = fixture.config;

    await assessment.setVotesOf(member.address, '10', 0, true);

    expect(await assessmentViewer.isStakeLocked(member.address)).to.equal(true);

    // advance time so that assessment lockup expires
    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + stakeLockupPeriodInDays * ONE_DAY_SECONDS + 1);

    expect(await assessmentViewer.isStakeLocked(member.address)).to.equal(false);
  });

  it('should return true if assessment lockup expiry has not passed', async function () {
    const fixture = await loadFixture(setup);
    const [member] = fixture.accounts.members;
    const { assessmentViewer, assessment } = fixture.contracts;

    await assessment.setVotesOf(member.address, '10', 0, true);

    expect(await assessmentViewer.isStakeLocked(member.address)).to.equal(true);
  });
});
