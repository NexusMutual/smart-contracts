const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { setTime, EVENT_TYPE, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;

describe('withdrawRewards', function () {
  it('reverts if there are no withdrawable rewards', async function () {
    assert(false, '[todo]');
  });

  it('withdraws rewards only until the last finalized assessment when an unfinalized assessment follows', async function () {
    const { assessment, claims } = this.contracts;
    const [user] = this.accounts.members;
    const { minVotingPeriodDays, payoutCooldownDays } = await assessment.config();
    await assessment.connect(user).stake(parseEther('10'));

    {
      await claims.connect(user).submitClaim(0, parseEther('100'), false, '');
      await assessment.connect(user).castVote(0, true);
      const timestamp = await time.latest();
      await setTime(timestamp.toNumber() + daysToSeconds(minVotingPeriodDays + payoutCooldownDays));
    }

    {
      await claims.connect(user).submitClaim(1, parseEther('100'), false, '');
      await assessment.connect(user).castVote(1, true);
    }

    await assessment.connect(user).withdrawRewards(user.address, 0);

    const { rewardsWithdrawnUntilIndex } = await assessment.stakeOf(user.address);
    expect(rewardsWithdrawnUntilIndex).to.be.equal(1);
  });

  it("mints rewards pro-rated by the user's stake at vote time, to the total amount staked on that assessment", async function () {
    assert(false, '[todo]');
    const { assessment } = this.contracts;

    await assessment.connect(this.accounts[1]).stake(parseEther('10'));
    for (let i = 0; i < 5; i++) {
      await startAssessment(assessment)(i);
      await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, i, true);
    }

    await time.increase(daysToSeconds(4));

    const tx = await assessment.withdrawReward(this.accounts[1].address, 0);
    const receipt = await tx.wait();
    console.log({ receipt, gasUsed: receipt.gasUsed.toString() });
  });
});
