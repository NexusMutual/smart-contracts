const { expect } = require('chai');

const uintParams = {
  minVotingPeriodDays: 0,
  stakeLockupPeriodDays: 1,
  payoutCooldownDays: 2,
};

describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
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

  it('sets each parameter to the given new values', async function () {
    const { assessment } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      minVotingPeriodDays: 111,
      stakeLockupPeriodDays: 222,
      payoutCooldownDays: 123,
    };

    {
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.minVotingPeriodDays, uintParams.stakeLockupPeriodDays, uintParams.payoutCooldownDays],
          [newValues.minVotingPeriodDays, newValues.stakeLockupPeriodDays, newValues.payoutCooldownDays],
        );
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();

      expect(minVotingPeriodDays).to.be.equal(newValues.minVotingPeriodDays);
      expect(stakeLockupPeriodDays).to.be.equal(newValues.stakeLockupPeriodDays);
      expect(payoutCooldownDays).to.be.equal(newValues.payoutCooldownDays);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { assessment } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      minVotingPeriodDays: 11,
      stakeLockupPeriodDays: 22,
      payoutCooldownDays: 23,
    };

    {
      const {
        stakeLockupPeriodDays: initialStakeLockupPeriodDays,
        payoutCooldownDays: initialPayoutCooldownDays,
      } = await assessment.config();
      await assessment
        .connect(governance)
        .updateUintParameters([uintParams.minVotingPeriodDays], [newValues.minVotingPeriodDays]);

      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();

      expect(minVotingPeriodDays).to.be.equal(newValues.minVotingPeriodDays);
      expect(stakeLockupPeriodDays).to.be.equal(initialStakeLockupPeriodDays);
      expect(payoutCooldownDays).to.be.equal(initialPayoutCooldownDays);
    }

    {
      const { minVotingPeriodDays: initialMinVotingPeriodDays } = await assessment.config();
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.stakeLockupPeriodDays, uintParams.payoutCooldownDays],
          [newValues.stakeLockupPeriodDays, newValues.payoutCooldownDays],
        );
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();

      expect(minVotingPeriodDays).to.be.equal(initialMinVotingPeriodDays);
      expect(stakeLockupPeriodDays).to.be.equal(newValues.stakeLockupPeriodDays);
      expect(payoutCooldownDays).to.be.equal(newValues.payoutCooldownDays);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const { assessment } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    {
      const newValues = {
        minVotingPeriodDays: 33,
        stakeLockupPeriodDays: 11,
        payoutCooldownDays: 22,
      };
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.stakeLockupPeriodDays, uintParams.minVotingPeriodDays, uintParams.payoutCooldownDays],
          [newValues.stakeLockupPeriodDays, newValues.minVotingPeriodDays, newValues.payoutCooldownDays],
        );
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();

      expect(minVotingPeriodDays).to.be.equal(newValues.minVotingPeriodDays);
      expect(stakeLockupPeriodDays).to.be.equal(newValues.stakeLockupPeriodDays);
      expect(payoutCooldownDays).to.be.equal(newValues.payoutCooldownDays);
    }

    {
      const newValues = {
        minVotingPeriodDays: 44,
        stakeLockupPeriodDays: 55,
        payoutCooldownDays: 66,
      };
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutCooldownDays, uintParams.stakeLockupPeriodDays, uintParams.minVotingPeriodDays],
          [newValues.payoutCooldownDays, newValues.stakeLockupPeriodDays, newValues.minVotingPeriodDays],
        );
      const { minVotingPeriodDays, stakeLockupPeriodDays, payoutCooldownDays } = await assessment.config();

      expect(minVotingPeriodDays).to.be.equal(newValues.minVotingPeriodDays);
      expect(stakeLockupPeriodDays).to.be.equal(newValues.stakeLockupPeriodDays);
      expect(payoutCooldownDays).to.be.equal(newValues.payoutCooldownDays);
    }
  });
});
