const { expect } = require('chai');

const uintParams = {
  minVotingPeriodInDays: 0,
  stakeLockupPeriodInDays: 1,
  payoutCooldownInDays: 2,
  silentEndingPeriodInDays: 3,
};

describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
    const { assessment } = this.contracts;
    const [user] = this.accounts.members;
    const [governance] = this.accounts.governanceContracts;
    await expect(assessment.connect(user).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(assessment.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('sets each parameter to the given new values', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const newValues = {
      minVotingPeriodInDays: 111,
      stakeLockupPeriodInDays: 222,
      payoutCooldownInDays: 123,
      silentEndingPeriodInDays: 121,
    };

    {
      await assessment
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.minVotingPeriodInDays,
            uintParams.stakeLockupPeriodInDays,
            uintParams.payoutCooldownInDays,
            uintParams.silentEndingPeriodInDays,
          ],
          [
            newValues.minVotingPeriodInDays,
            newValues.stakeLockupPeriodInDays,
            newValues.payoutCooldownInDays,
            newValues.silentEndingPeriodInDays,
          ],
        );
      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays, silentEndingPeriodInDays } =
        await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(newValues.minVotingPeriodInDays);
      expect(stakeLockupPeriodInDays).to.be.equal(newValues.stakeLockupPeriodInDays);
      expect(payoutCooldownInDays).to.be.equal(newValues.payoutCooldownInDays);
      expect(silentEndingPeriodInDays).to.be.equal(newValues.silentEndingPeriodInDays);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;
    const newValues = {
      minVotingPeriodInDays: 11,
      stakeLockupPeriodInDays: 22,
      payoutCooldownInDays: 23,
      silentEndingPeriodInDays: 21,
    };

    {
      const {
        stakeLockupPeriodInDays: initialStakeLockupPeriodDays,
        payoutCooldownInDays: initialPayoutCooldownDays,
        silentEndingPeriodInDays: initialSilentEndingPeriodInDays,
      } = await assessment.config();
      await assessment
        .connect(governance)
        .updateUintParameters([uintParams.minVotingPeriodInDays], [newValues.minVotingPeriodInDays]);

      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays, silentEndingPeriodInDays } =
        await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(newValues.minVotingPeriodInDays);
      expect(stakeLockupPeriodInDays).to.be.equal(initialStakeLockupPeriodDays);
      expect(payoutCooldownInDays).to.be.equal(initialPayoutCooldownDays);
      expect(silentEndingPeriodInDays).to.be.equal(initialSilentEndingPeriodInDays);
    }

    {
      const {
        minVotingPeriodInDays: initialMinVotingPeriodDays,
        silentEndingPeriodInDays: initialSilentEndingPeriodInDays,
      } = await assessment.config();
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.stakeLockupPeriodInDays, uintParams.payoutCooldownInDays],
          [newValues.stakeLockupPeriodInDays, newValues.payoutCooldownInDays],
        );
      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays, silentEndingPeriodInDays } =
        await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(initialMinVotingPeriodDays);
      expect(stakeLockupPeriodInDays).to.be.equal(newValues.stakeLockupPeriodInDays);
      expect(payoutCooldownInDays).to.be.equal(newValues.payoutCooldownInDays);
      expect(silentEndingPeriodInDays).to.be.equal(initialSilentEndingPeriodInDays);
    }

    {
      const { minVotingPeriodInDays: initialMinVotingPeriodDays } = await assessment.config();
      await assessment
        .connect(governance)
        .updateUintParameters([uintParams.silentEndingPeriodInDays], [newValues.silentEndingPeriodInDays]);
      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays, silentEndingPeriodInDays } =
        await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(initialMinVotingPeriodDays);
      expect(stakeLockupPeriodInDays).to.be.equal(newValues.stakeLockupPeriodInDays);
      expect(payoutCooldownInDays).to.be.equal(newValues.payoutCooldownInDays);
      expect(silentEndingPeriodInDays).to.be.equal(newValues.silentEndingPeriodInDays);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const { assessment } = this.contracts;
    const [governance] = this.accounts.governanceContracts;

    {
      const newValues = {
        minVotingPeriodInDays: 33,
        stakeLockupPeriodInDays: 11,
        payoutCooldownInDays: 22,
      };
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.stakeLockupPeriodInDays, uintParams.minVotingPeriodInDays, uintParams.payoutCooldownInDays],
          [newValues.stakeLockupPeriodInDays, newValues.minVotingPeriodInDays, newValues.payoutCooldownInDays],
        );
      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays } = await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(newValues.minVotingPeriodInDays);
      expect(stakeLockupPeriodInDays).to.be.equal(newValues.stakeLockupPeriodInDays);
      expect(payoutCooldownInDays).to.be.equal(newValues.payoutCooldownInDays);
    }

    {
      const newValues = {
        minVotingPeriodInDays: 44,
        stakeLockupPeriodInDays: 55,
        payoutCooldownInDays: 66,
      };
      await assessment
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutCooldownInDays, uintParams.stakeLockupPeriodInDays, uintParams.minVotingPeriodInDays],
          [newValues.payoutCooldownInDays, newValues.stakeLockupPeriodInDays, newValues.minVotingPeriodInDays],
        );
      const { minVotingPeriodInDays, stakeLockupPeriodInDays, payoutCooldownInDays } = await assessment.config();

      expect(minVotingPeriodInDays).to.be.equal(newValues.minVotingPeriodInDays);
      expect(stakeLockupPeriodInDays).to.be.equal(newValues.stakeLockupPeriodInDays);
      expect(payoutCooldownInDays).to.be.equal(newValues.payoutCooldownInDays);
    }
  });
});
