const { ethers } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { submitClaim, EVENT_TYPE, daysToSeconds } = require('./helpers');
const { parseEther } = ethers.utils;

const UintParams = {
  minVotingPeriodDays: 0,
  stakeLockupPeriodDays: 1,
  payoutCooldownDays: 2,
};

describe('updateUintParameters', function () {
  it('can only be called by governance contract', async function () {
    const { assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [governance] = this.accounts.governanceContracts;
    expect(assessment.connect(user).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    expect(assessment.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('updates the config according to the calldata params', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    {
      await assessment
        .connect(governance)
        .updateUintParameters(
          [UintParams.minVotingPeriodDays, UintParams.stakeLockupPeriodDays, UintParams.payoutCooldownDays],
          [1, 1, 1],
        );
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();
      expect(minVotingPeriodDays).to.be.equal(1);
      expect(stakeLockupPeriodDays).to.be.equal(1);
      expect(payoutCooldownDays).to.be.equal(1);
    }

    {
      await assessment.connect(governance).updateUintParameters([UintParams.stakeLockupPeriodDays], [2]);
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();
      expect(minVotingPeriodDays).to.be.equal(1);
      expect(stakeLockupPeriodDays).to.be.equal(2);
      expect(payoutCooldownDays).to.be.equal(1);
    }

    {
      await assessment
        .connect(governance)
        .updateUintParameters([UintParams.minVotingPeriodDays, UintParams.payoutCooldownDays], [3, 3]);
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();
      expect(minVotingPeriodDays).to.be.equal(3);
      expect(stakeLockupPeriodDays).to.be.equal(2);
      expect(payoutCooldownDays).to.be.equal(3);
    }
  });
});
