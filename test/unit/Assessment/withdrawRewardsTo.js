const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setNextBlockBaseFee } = require('../utils').evm;
const { setTime, finalizePoll, generateRewards } = require('./helpers');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('withdrawRewardsTo', function () {
  it('reverts if there are no withdrawable rewards', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;

    await assessment.connect(user).stake(parseEther('10'));

    const withdrawRewardsTo = assessment.connect(user).withdrawRewardsTo(user.address, 0);
    await expect(withdrawRewardsTo).to.be.revertedWithCustomError(assessment, 'NoWithdrawableRewards');
  });

  it('reverts when not called by the owner of the rewards ', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await finalizePoll(assessment);

    const [nonMember] = fixture.accounts.nonMembers;
    const { totalRewardInNXM } = await assessment.assessments(0);
    const nonMemberBalanceBefore = await nxm.balanceOf(nonMember.address);
    const stakerBalanceBefore = await nxm.balanceOf(staker.address);

    const withdrawRewardsTo = assessment.connect(nonMember).withdrawRewardsTo(staker.address, 0);
    await expect(withdrawRewardsTo).to.be.revertedWithCustomError(assessment, 'NoWithdrawableRewards');

    await setNextBlockBaseFee('0');
    await expect(assessment.connect(staker).withdrawRewardsTo(staker.address, 0, { gasPrice: 0 })).not.to.be.reverted;
    const nonMemberBalanceAfter = await nxm.balanceOf(nonMember.address);
    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
    expect(nonMemberBalanceAfter).to.be.equal(nonMemberBalanceBefore);
    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore.add(totalRewardInNXM));
  });

  it('sends the rewards to any member address', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [staker, otherMember] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await finalizePoll(assessment);

    const { totalRewardInNXM } = await assessment.assessments(0);
    const nonMemberBalanceBefore = await nxm.balanceOf(staker.address);
    const stakerBalanceBefore = await nxm.balanceOf(otherMember.address);
    await setNextBlockBaseFee('0');
    await expect(assessment.connect(staker).withdrawRewardsTo(otherMember.address, 0, { gasPrice: 0 })).not.to.be
      .reverted;
    const nonMemberBalanceAfter = await nxm.balanceOf(staker.address);
    const stakerBalanceAfter = await nxm.balanceOf(otherMember.address);
    expect(nonMemberBalanceAfter).to.be.equal(nonMemberBalanceBefore);
    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore.add(totalRewardInNXM));
  });

  it('withdraws rewards up to the last finalized assessment when an unfinalized assessment follows', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [user] = fixture.accounts.members;

    await assessment.connect(user).stake(parseEther('10'));

    await individualClaims.connect(user).submitClaim(0, 0, parseEther('100'), '');
    await assessment.connect(user).castVotes([0], [true], ['Assessment data hash'], 0);

    await finalizePoll(assessment);

    await individualClaims.connect(user).submitClaim(1, 0, parseEther('100'), '');
    await assessment.connect(user).castVotes([1], [true], ['Assessment data hash'], 0);

    await individualClaims.connect(user).submitClaim(2, 0, parseEther('100'), '');
    await assessment.connect(user).castVotes([2], [true], ['Assessment data hash'], 0);

    const balanceBefore = await nxm.balanceOf(user.address);

    await assessment.connect(user).withdrawRewardsTo(user.address, 0);
    const { rewardsWithdrawableFromIndex } = await assessment.stakeOf(user.address);
    expect(rewardsWithdrawableFromIndex).to.be.equal(1);

    const { totalRewardInNXM } = await assessment.assessments(0);
    const balanceAfter = await nxm.balanceOf(user.address);
    expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM));
  });

  it("mints rewards based on user's stake at vote time", async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [user1, user2, user3] = fixture.accounts.members;

    {
      await individualClaims.connect(user1).submitClaim(0, 0, parseEther('100'), '');
      await assessment.connect(user1).stake(parseEther('10'));
      await assessment.connect(user2).stake(parseEther('10'));
      await assessment.connect(user3).stake(parseEther('10'));

      await assessment.connect(user1).castVotes([0], [true], ['Assessment data hash'], 0);
      await assessment.connect(user2).castVotes([0], [true], ['Assessment data hash'], 0);
      await assessment.connect(user3).castVotes([0], [true], ['Assessment data hash'], 0);
      const { totalRewardInNXM } = await assessment.assessments(0);

      await finalizePoll(assessment);

      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(3)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewardsTo(user2.address, 0);
        const balanceAfter = await nxm.balanceOf(user2.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(3)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user3.address);
        await assessment.connect(user3).withdrawRewardsTo(user3.address, 0);
        const balanceAfter = await nxm.balanceOf(user3.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(3)));
      }
    }

    {
      await individualClaims.connect(user1).submitClaim(1, 0, parseEther('100'), '');

      await assessment.connect(user1).castVotes([1], [true], ['Assessment data hash'], 0);
      await assessment.connect(user2).castVotes([1], [true], ['Assessment data hash'], 0);
      const { totalRewardInNXM } = await assessment.assessments(1);

      await finalizePoll(assessment);

      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(2)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewardsTo(user2.address, 0);
        const balanceAfter = await nxm.balanceOf(user2.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(2)));
      }
    }

    {
      await individualClaims.connect(user1).submitClaim(2, 0, parseEther('100'), '');
      await assessment.connect(user1).stake(parseEther('10'));
      await assessment.connect(user2).stake(parseEther('27'));
      await assessment.connect(user3).stake(parseEther('33'));

      await assessment.connect(user1).castVotes([2], [true], ['Assessment data hash'], 0);
      await assessment.connect(user2).castVotes([2], [true], ['Assessment data hash'], 0);
      await assessment.connect(user3).castVotes([2], [true], ['Assessment data hash'], 0);
      const { totalRewardInNXM } = await assessment.assessments(2);

      await finalizePoll(assessment);

      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(20).div(100)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewardsTo(user2.address, 0);
        const balanceAfter = await nxm.balanceOf(user2.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(37).div(100)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user3.address);
        await assessment.connect(user3).withdrawRewardsTo(user3.address, 0);
        const balanceAfter = await nxm.balanceOf(user3.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(43).div(100)));
      }
    }
  });

  it('should withdraw multiple rewards consecutively', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [user1] = fixture.accounts.members;

    {
      await individualClaims.connect(user1).submitClaim(0, 0, parseEther('100'), '');
      await individualClaims.connect(user1).submitClaim(1, 0, parseEther('100'), '');
      await individualClaims.connect(user1).submitClaim(2, 0, parseEther('100'), '');
      await assessment.connect(user1).stake(parseEther('10'));
      await assessment
        .connect(user1)
        .castVotes(
          [0, 1, 2],
          [true, true, true],
          ['Assessment data hash', 'Assessment data hash', 'Assessment data hash'],
          0,
        );

      const { totalRewardInNXM } = await assessment.assessments(0);

      await finalizePoll(assessment);

      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 1);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.equal(totalRewardInNXM);
      }
      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 1);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM));
      }
      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 1);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM));
      }
    }
  });

  it('should withdraw multiple rewards in one tx', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [user1] = fixture.accounts.members;

    {
      await individualClaims.connect(user1).submitClaim(0, 0, parseEther('100'), '');
      await individualClaims.connect(user1).submitClaim(1, 0, parseEther('100'), '');
      await individualClaims.connect(user1).submitClaim(2, 0, parseEther('100'), '');
      await assessment.connect(user1).stake(parseEther('10'));
      await assessment
        .connect(user1)
        .castVotes(
          [0, 1, 2],
          [true, true, true],
          ['Assessment data hash', 'Assessment data hash', 'Assessment data hash'],
          0,
        );

      const { totalRewardInNXM } = await assessment.assessments(0);

      await finalizePoll(assessment);

      {
        const balanceBefore = await nxm.balanceOf(user1.address);
        await assessment.connect(user1).withdrawRewardsTo(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter.sub(balanceBefore)).to.be.equal(totalRewardInNXM.mul(3));
      }
    }
  });

  it('emits RewardWithdrawn event with staker, destination and withdrawn amount', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    const [staker, user1] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });
    const { totalRewardInNXM } = await assessment.assessments(0);

    await finalizePoll(assessment);

    await expect(assessment.connect(staker).withdrawRewardsTo(user1.address, 0))
      .to.emit(assessment, 'RewardWithdrawn')
      .withArgs(staker.address, user1.address, totalRewardInNXM);
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, master, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await master.setEmergencyPause(true);

    await expect(assessment.connect(staker).withdrawRewardsTo(staker.address, 0)).to.be.revertedWith(
      'System is paused',
    );
  });

  it('reverts if assessment rewards already claimed', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims, nxm } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await finalizePoll(assessment);

    const { totalRewardInNXM } = await assessment.assessments(0);

    const stakerBalanceBefore = await nxm.balanceOf(staker.address);
    const stakeOfBefore = await assessment.stakeOf(staker.address);

    await assessment.connect(staker).withdrawRewardsTo(staker.address, 0);

    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
    const stakeOfAfter = await assessment.stakeOf(staker.address);

    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore.add(totalRewardInNXM));
    expect(stakeOfAfter.rewardsWithdrawableFromIndex).to.be.equal(stakeOfBefore.rewardsWithdrawableFromIndex.add(1));

    const withdrawRewardsTo = assessment.connect(staker).withdrawRewardsTo(staker.address, 0);
    await expect(withdrawRewardsTo).to.be.revertedWithCustomError(assessment, 'NoWithdrawableRewards');
  });

  it('withdraws zero amount if poll is not final', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims, nxm } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    const { minVotingPeriodInDays, payoutCooldownInDays } = await assessment.config();
    await generateRewards({ assessment, individualClaims, staker });

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setTime(timestamp + daysToSeconds(minVotingPeriodInDays + payoutCooldownInDays - 1));

    const stakerBalanceBefore = await nxm.balanceOf(staker.address);
    const stakeOfBefore = await assessment.stakeOf(staker.address);

    await assessment.connect(staker).withdrawRewardsTo(staker.address, 0);

    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
    const stakeOfAfter = await assessment.stakeOf(staker.address);

    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore);
    expect(stakeOfAfter.rewardsWithdrawableFromIndex).to.be.equal(stakeOfBefore.rewardsWithdrawableFromIndex);
  });
});
