const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim } = require('./helpers');

const { parseEther } = ethers.utils;

const EVENT_TYPE = {
  CLAIM: 0,
  INCIDENT: 1,
};

// Converts days to seconds
const days = numberOfDays => numberOfDays * 24 * 60 * 60;

describe('withdrawReward', function () {
  it('test', async function () {
    const { assessment } = this.contracts;

    await assessment.connect(this.accounts[1]).depositStake(parseEther('10'));
    for (let i = 0; i < 5; i++) {
      await submitClaim(assessment)(i);
      await assessment.connect(this.accounts[1]).castVote(EVENT_TYPE.CLAIM, i, true);
    }

    await time.increase(days(90));

    const tx = await assessment.withdrawReward(this.accounts[1].address, 0);
    const receipt = await tx.wait();
    console.log({ receipt, gasUsed: receipt.gasUsed.toString() });
  });
});
