const { expect } = require('chai');
const { ethers } = require('hardhat');
const { setTime } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const ONE_DAY_SECONDS = 24 * 60 * 60;

describe('unstake', function () {
  it("decreases the user's stake", async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const user = fixture.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));

    {
      await assessment.connect(user).unstake(parseEther('10'), user.address);
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('90'));
    }

    {
      await assessment.connect(user).unstake(parseEther('10'), user.address);
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('80'));
    }

    {
      await assessment.connect(user).unstake(parseEther('30'), user.address);
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('50'));
    }

    {
      await assessment.connect(user).unstake(parseEther('50'), user.address);
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('0'));
    }
  });

  it('transfers the staked NXM to the provided address', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, nxm } = fixture.contracts;
    const [user1, user2] = fixture.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));

    {
      const nxmBalanceBefore = await nxm.balanceOf(user1.address);
      await assessment.connect(user1).unstake(parseEther('50'), user1.address);
      const nxmBalanceAfter = await nxm.balanceOf(user1.address);
      expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(parseEther('50')));
    }

    {
      const nxmBalanceBefore = await nxm.balanceOf(user2.address);
      await assessment.connect(user1).unstake(parseEther('50'), user2.address);
      const nxmBalanceAfter = await nxm.balanceOf(user2.address);
      expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(parseEther('50')));
    }
  });

  it("reverts if less than stakeLockupPeriodInDays passed since the staker's last vote", async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    const user = fixture.accounts.members[0];
    const amount = parseEther('100');

    await assessment.connect(user).stake(amount);
    await individualClaims.submitClaim(0, 0, amount, '');

    const { timestamp } = await ethers.provider.getBlock('latest'); // store the block.timestamp on time of vote
    await assessment.connect(user).castVotes([0], [true], ['Assessment data hash'], 0);

    const unstakeBeforeExpiry = assessment.connect(user).unstake(amount, user.address);
    await expect(unstakeBeforeExpiry).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');

    const { stakeLockupPeriodInDays } = await assessment.config();
    for (let dayCount = 1; dayCount < stakeLockupPeriodInDays; dayCount++) {
      await setTime(timestamp + dayCount * ONE_DAY_SECONDS);
      const unstake = assessment.connect(user).unstake(amount, user.address);
      await expect(unstake).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');
    }

    await setTime(timestamp + stakeLockupPeriodInDays * ONE_DAY_SECONDS);
    const unstakeAtExpiry = assessment.connect(user).unstake(amount, user.address);
    await expect(unstakeAtExpiry).to.be.revertedWithCustomError(assessment, 'StakeLockedForAssessment');
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, master } = fixture.contracts;
    const [user] = fixture.accounts.members;
    await master.setEmergencyPause(true);

    await expect(assessment.unstake(parseEther('100'), user.address)).to.revertedWith('System is paused');
  });

  it('does not revert if amount is 0', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const user = fixture.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));

    await expect(assessment.connect(user).unstake(0, user.address)).to.not.reverted;
  });

  it('reverts with InvalidAmount user has no stake to unstake', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;
    // no stake
    const unstake = assessment.connect(user).unstake(parseEther('50'), user.address);
    await expect(unstake).to.be.revertedWithCustomError(assessment, 'InvalidAmount').withArgs(0);
  });

  it('reverts with InvalidAmount if amount is bigger than the stake', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;
    const stakeAmount = parseEther('100');
    await assessment.connect(user).stake(stakeAmount);

    const unstake = assessment.connect(user).unstake(stakeAmount.add(1), user.address);
    await expect(unstake).to.be.revertedWithCustomError(assessment, 'InvalidAmount').withArgs(stakeAmount);
  });

  it('emits StakeWithdrawn event with staker, destination and amount', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user1, user2] = fixture.accounts.members;
    await assessment.connect(user1).stake(parseEther('100'));

    {
      const amount = parseEther('10');
      await expect(assessment.connect(user1).unstake(amount, user1.address))
        .to.emit(assessment, 'StakeWithdrawn')
        .withArgs(user1.address, user1.address, amount);
    }

    {
      const amount = parseEther('20');
      await expect(assessment.connect(user1).unstake(amount, user2.address))
        .to.emit(assessment, 'StakeWithdrawn')
        .withArgs(user1.address, user2.address, amount);
    }
  });

  it('reverts if attempting to stake while NXM is locked for voting in governance', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment } = fixture.contracts;
    const [user, otherUser] = fixture.accounts.members;

    await assessment.connect(user).stake(parseEther('100'));
    await nxm.setLock(user.address, 100);

    const unstake = assessment.connect(user).unstake(parseEther('100'), otherUser.address);
    await expect(unstake).to.be.revertedWithCustomError(assessment, 'StakeLockedForGovernance');
  });

  it('allows to unstake to own address while NXM is locked for voting in governance', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;
    const amount = parseEther('100');

    await assessment.connect(user).stake(amount);
    const balanceBefore = await nxm.balanceOf(user.address);

    await nxm.setLock(user.address, 100);
    await assessment.connect(user).unstake(amount, user.address);

    const balanceAfter = await nxm.balanceOf(user.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(amount));
  });
});
