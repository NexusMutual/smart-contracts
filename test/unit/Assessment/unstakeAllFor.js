const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setTime } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const ONE_DAY_SECONDS = 24 * 60 * 60;

describe('unstakeAllFor', function () {
  it("decreases the staker's stake to 0", async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;
    await assessment.connect(user).stake(parseEther('100'));

    await assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);
    const { amount } = await assessment.stakeOf(user.address);
    expect(amount).to.be.equal(parseEther('0'));
  });

  it('transfers all the staked NXM to the provided address', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, nxm } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user, otherUser] = fixture.accounts.members;
    const stakeAmount = parseEther('100');
    await assessment.connect(user).stake(stakeAmount);

    const user1BalanceBefore = await nxm.balanceOf(user.address);
    const user2BalanceBefore = await nxm.balanceOf(otherUser.address);

    await assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);

    const user1BalanceAfter = await nxm.balanceOf(user.address);
    const user2BalanceAfter = await nxm.balanceOf(otherUser.address);

    expect(user1BalanceAfter).to.be.equal(user1BalanceBefore.add(stakeAmount));
    expect(user2BalanceAfter).to.be.equal(user2BalanceBefore);
  });

  it("reverts if less than stakeLockupPeriodInDays passed since the staker's last vote", async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;
    const amount = parseEther('100');

    await assessment.connect(user).stake(amount);
    await individualClaims.submitClaim(0, 0, amount, '');

    const { timestamp } = await ethers.provider.getBlock('latest'); // store the block.timestamp on time of vote
    await assessment.connect(user).castVotes([0], [true], ['Assessment data hash'], 0);

    const unstakeForBeforeExpiry = assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);
    await expect(unstakeForBeforeExpiry).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');

    const { stakeLockupPeriodInDays } = await assessment.config();
    for (let dayCount = 1; dayCount < stakeLockupPeriodInDays; dayCount++) {
      await setTime(timestamp + dayCount * ONE_DAY_SECONDS);
      const unstakeFor = assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);
      await expect(unstakeFor).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');
    }

    await setTime(timestamp + stakeLockupPeriodInDays * ONE_DAY_SECONDS);
    const unstakeForAtExpiry = assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);
    await expect(unstakeForAtExpiry).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, master } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;
    await master.setEmergencyPause(true);

    const unstakeFor = assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);
    await expect(unstakeFor).to.be.revertedWith('System is paused');
  });

  it('reverts if called by any address other than the TokenController', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user, otherAddress] = fixture.accounts.members;

    const unstakeFor = assessment.connect(otherAddress).unstakeAllFor(user.address);
    await expect(unstakeFor).to.be.revertedWithCustomError(assessment, 'OnlyTokenController');
  });

  it('does NOT revert if user has no stake to unstake', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;

    const assessmentStake = await assessment.stakeOf(user.address);
    expect(assessmentStake.amount.toString()).to.equal('0');

    await expect(assessment.connect(tokenControllerSigner).unstakeAllFor(user.address)).to.not.be.reverted;
  });

  it('emits StakeWithdrawn event with staker, destination and amount', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;

    const stakeAmount = parseEther('100');
    await assessment.connect(user).stake(stakeAmount);

    await expect(assessment.connect(tokenControllerSigner).unstakeAllFor(user.address))
      .to.emit(assessment, 'StakeWithdrawn')
      .withArgs(user.address, user.address, stakeAmount);
  });

  it('allows to unstake while NXM is locked for voting in governance (own address)', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment } = fixture.contracts;
    const { tokenControllerSigner } = fixture.accounts;
    const [user] = fixture.accounts.members;
    const amount = parseEther('100');

    await assessment.connect(user).stake(amount);
    const balanceBefore = await nxm.balanceOf(user.address);

    await nxm.setLock(user.address, 100);
    await assessment.connect(tokenControllerSigner).unstakeAllFor(user.address);

    const balanceAfter = await nxm.balanceOf(user.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(amount));
  });
});
