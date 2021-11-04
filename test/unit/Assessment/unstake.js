const { assert, expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { daysToSeconds, setTime } = require('./helpers');
const { parseEther } = ethers.utils;

describe('unstake', function () {
  it("decreases the user's stake", async function () {
    const { assessment } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));

    {
      await assessment.connect(user).unstake(parseEther('10'));
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('90'));
    }

    {
      await assessment.connect(user).unstake(parseEther('10'));
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('80'));
    }

    {
      await assessment.connect(user).unstake(parseEther('30'));
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('50'));
    }

    {
      await assessment.connect(user).unstake(parseEther('50'));
      const { amount } = await assessment.stakeOf(user.address);
      expect(amount).to.be.equal(parseEther('0'));
    }
  });

  it("transfers the staked NXM to the staker's address", async function () {
    const { assessment, nxm } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));

    {
      const nxmBalanceBefore = await nxm.balanceOf(user.address);
      await assessment.connect(user).unstake(parseEther('50'));
      const nxmBalanceAfter = await nxm.balanceOf(user.address);
      expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(parseEther('50')));
    }

    {
      const nxmBalanceBefore = await nxm.balanceOf(user.address);
      await assessment.connect(user).unstake(parseEther('50'));
      const nxmBalanceAfter = await nxm.balanceOf(user.address);
      expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(parseEther('50')));
    }
  });

  it("reverts if less than stakeLockupPeriodDays passed since the staker's last vote", async function () {
    const { assessment, nxm, claims } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await claims.submitClaim(0, parseEther('100'), false, '');
    await assessment.connect(user).castVote(0, true);
    await expect(assessment.connect(user).unstake(parseEther('100'))).to.be.revertedWith('Stake is in lockup period');

    const { stakeLockupPeriodDays } = await assessment.config();
    const timestamp = await time.latest();
    for (let i = 1; i < stakeLockupPeriodDays; i++) {
      await setTime(timestamp.toNumber() + daysToSeconds(i));
      await expect(assessment.connect(user).unstake(parseEther('100'))).to.be.revertedWith('Stake is in lockup period');
    }
    await setTime(timestamp.toNumber() + daysToSeconds(stakeLockupPeriodDays));
    expect(assessment.connect(user).unstake(parseEther('100'))).not.to.be.revertedWith('Stake is in lockup period');
  });
});
