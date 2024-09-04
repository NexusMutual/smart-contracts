const { ethers } = require('hardhat');
const { expect } = require('chai');

const { setNextBlockBaseFee } = require('../utils').evm;
const { setTime, finalizePoll, generateRewards } = require('./helpers');
const { Role } = require('../../../lib/constants');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;
const daysToSeconds = days => days * 24 * 60 * 60;

describe('withdrawRewards', function () {
  it('reverts if there are no withdrawable rewards', async function () {
    const fixture = await loadFixture(setup);
    const { assessment } = fixture.contracts;
    const [user] = fixture.accounts.members;

    await assessment.connect(user).stake(parseEther('10'));

    const withdrawRewards = assessment.connect(user).withdrawRewards(user.address, 0);
    await expect(withdrawRewards).to.be.revertedWithCustomError(assessment, 'NoWithdrawableRewards');
  });

  it("allows any address to call but the reward is withdrawn to the staker's address", async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await finalizePoll(assessment);

    const [nonMember] = fixture.accounts.nonMembers;
    const { totalRewardInNXM } = await assessment.assessments(0);
    const nonMemberBalanceBefore = await nxm.balanceOf(nonMember.address);
    const stakerBalanceBefore = await nxm.balanceOf(staker.address);
    await setNextBlockBaseFee('0');
    await expect(assessment.connect(nonMember).withdrawRewards(staker.address, 0, { gasPrice: 0 })).not.to.be.reverted;
    const nonMemberBalanceAfter = await nxm.balanceOf(nonMember.address);
    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
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

    await assessment.connect(user).withdrawRewards(user.address, 0);
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
        await assessment.connect(user1).withdrawRewards(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(3)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewards(user2.address, 0);
        const balanceAfter = await nxm.balanceOf(user2.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(3)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user3.address);
        await assessment.connect(user3).withdrawRewards(user3.address, 0);
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
        await assessment.connect(user1).withdrawRewards(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(2)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewards(user2.address, 0);
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
        await assessment.connect(user1).withdrawRewards(user1.address, 0);
        const balanceAfter = await nxm.balanceOf(user1.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(20).div(100)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user2.address);
        await assessment.connect(user2).withdrawRewards(user2.address, 0);
        const balanceAfter = await nxm.balanceOf(user2.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(37).div(100)));
      }

      {
        const balanceBefore = await nxm.balanceOf(user3.address);
        await assessment.connect(user3).withdrawRewards(user3.address, 0);
        const balanceAfter = await nxm.balanceOf(user3.address);
        expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(43).div(100)));
      }
    }
  });

  it('emits RewardWithdrawn event with staker and withdrawn amount', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });
    const { totalRewardInNXM } = await assessment.assessments(0);

    await finalizePoll(assessment);

    await expect(assessment.connect(staker).withdrawRewards(staker.address, 0))
      .to.emit(assessment, 'RewardWithdrawn')
      .withArgs(staker.address, staker.address, totalRewardInNXM);
  });

  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { assessment, master, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    await generateRewards({ assessment, individualClaims, staker });

    await master.setEmergencyPause(true);

    await expect(assessment.connect(staker).withdrawRewards(staker.address, 0)).to.be.revertedWith('System is paused');
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

    await assessment.connect(staker).withdrawRewards(staker.address, 0);

    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
    const stakeOfAfter = await assessment.stakeOf(staker.address);

    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore.add(totalRewardInNXM));
    expect(stakeOfAfter.rewardsWithdrawableFromIndex).to.be.equal(stakeOfBefore.rewardsWithdrawableFromIndex.add(1));

    const withdrawRewards = assessment.connect(staker).withdrawRewards(staker.address, 0);
    await expect(withdrawRewards).to.be.revertedWithCustomError(assessment, 'NoWithdrawableRewards');
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

    await assessment.connect(staker).withdrawRewards(staker.address, 0);

    const stakerBalanceAfter = await nxm.balanceOf(staker.address);
    const stakeOfAfter = await assessment.stakeOf(staker.address);

    expect(stakerBalanceAfter).to.be.equal(stakerBalanceBefore);
    expect(stakeOfAfter.rewardsWithdrawableFromIndex).to.be.equal(stakeOfBefore.rewardsWithdrawableFromIndex);
  });

  it('should withdraw multiple rewards in one tx', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims } = fixture.contracts;
    const [staker] = fixture.accounts.members;

    {
      await individualClaims.connect(staker).submitClaim(0, 0, parseEther('100'), '');
      await individualClaims.connect(staker).submitClaim(1, 0, parseEther('100'), '');
      await individualClaims.connect(staker).submitClaim(2, 0, parseEther('100'), '');
      await assessment.connect(staker).stake(parseEther('10'));
      await assessment
        .connect(staker)
        .castVotes(
          [0, 1, 2],
          [true, true, true],
          ['Assessment data hash', 'Assessment data hash', 'Assessment data hash'],
          0,
        );

      const { totalRewardInNXM } = await assessment.assessments(0);

      await finalizePoll(assessment);

      const balanceBefore = await nxm.balanceOf(staker.address);
      await assessment.connect(staker).withdrawRewards(staker.address, 3);
      const balanceAfter = await nxm.balanceOf(staker.address);
      expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.mul(3)));
    }
  });

  it('allows multiple members to correctly withdraw their rewards', async function () {
    const fixture = await loadFixture(setup);
    const { nxm, assessment, individualClaims, memberRoles, tokenController } = fixture.contracts;

    // 5 members + 5 AB
    const voters = [...fixture.accounts.members, ...fixture.accounts.advisoryBoardMembers];

    // Add AB accounts as new members
    for (const member of fixture.accounts.advisoryBoardMembers) {
      await memberRoles.enrollMember(member.address, Role.Member);
      await nxm.mint(member.address, parseEther('10000'));
      await nxm.connect(member).approve(tokenController.address, parseEther('10000'));
    }

    const stakeAmount = parseEther('10');

    await individualClaims.submitClaim(0, 0, parseEther('100'), '');

    for (const user of voters) {
      await assessment.connect(user).castVotes([0], [true], ['Assessment data hash'], stakeAmount);
    }

    const { totalRewardInNXM } = await assessment.assessments(0);

    await finalizePoll(assessment);

    for (const user of voters) {
      const balanceBefore = await nxm.balanceOf(user.address);
      await assessment.connect(user).withdrawRewards(user.address, 0);
      const balanceAfter = await nxm.balanceOf(user.address);
      expect(balanceAfter).to.be.equal(balanceBefore.add(totalRewardInNXM.div(voters.length)));
    }
  });
});
