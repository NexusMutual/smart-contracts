const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');

const { parseEther } = ethers.utils;

describe('withdrawReward', function () {
  it("reverts if untilIndex is grater than the users' number of votes", async function () {
    assert(false, '[todo]');
  });

  it('reverts if there are no withdrawable rewards', async function () {
    assert(false, '[todo]');
  });

  it('reverts if there are no withdrawable rewards', async function () {
    assert(false, '[todo]');
  });

  it('withdraws rewards only until the last finalized assessment if an unfinalized assessment follows', async function () {
    assert(false, '[todo]');
  });

  it("mints rewards pro-rated by the user's stake at vote time to the total staked on that assessment", async function () {
    assert(false, '[todo]');
  });

  it('test', async function () {
    return;
    const { assessment } = this.contracts;

    await assessment.connect(this.accounts[1]).depositStake(parseEther('10'));
    for (let i = 0; i < 5; i++) {
      // await startAssessment(assessment)(i);
      await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, i, true);
    }

    await time.increase(daysToSeconds(90));

    const tx = await assessment.withdrawReward(this.accounts[1].address, 0);
    const receipt = await tx.wait();
    console.log({ receipt, gasUsed: receipt.gasUsed.toString() });
  });
});
