const { expect } = require('chai');
const { ethers } = require('hardhat');
const { daysToSeconds, setTime } = require('./helpers');
const { parseEther } = ethers.utils;

describe('unstake', function () {
  it("decreases the user's stake", async function () {
    const { assessment } = this.contracts;
    const user = this.accounts.members[0];
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
    const { assessment, nxm } = this.contracts;
    const user1 = this.accounts.members[0];
    const user2 = this.accounts.members[1];
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
    const { assessment, nxm, individualClaims } = this.contracts;
    const user = this.accounts.members[0];
    await assessment.connect(user).stake(parseEther('100'));
    await individualClaims.submitClaim(0, 0, parseEther('100'), '');
    await assessment.connect(user).castVote(0, true);
    await expect(assessment.connect(user).unstake(parseEther('100'), user.address)).to.be.revertedWith(
      'Stake is in lockup period',
    );

    const { stakeLockupPeriodInDays } = await assessment.config();
    const { timestamp } = await ethers.provider.getBlock('latest');
    for (let i = 1; i < stakeLockupPeriodInDays; i++) {
      await setTime(timestamp + daysToSeconds(i));
      await expect(assessment.connect(user).unstake(parseEther('100'), user.address)).to.be.revertedWith(
        'Stake is in lockup period',
      );
    }
    await setTime(timestamp + daysToSeconds(stakeLockupPeriodInDays));
    await expect(assessment.connect(user).unstake(parseEther('100'), user.address)).not.to.be.revertedWith(
      'Stake is in lockup period',
    );
  });
});
