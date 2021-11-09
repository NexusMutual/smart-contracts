const { expect } = require('chai');

const uintParams = { payoutRedemptionPeriodDays: 0, minAssessmentDepositRatio: 1, maxRewardNXM: 2, rewardRatio: 3 };

describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
    const { claims } = this.contracts;
    const {
      governanceContracts: [governance],
      members: [member],
    } = this.accounts;
    await expect(claims.connect(member).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(claims.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('sets each parameter to the given new values', async function () {
    const { claims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardNXM: 3333,
      rewardRatio: 4444,
    };

    {
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.payoutRedemptionPeriodDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.maxRewardNXM,
            uintParams.rewardRatio,
          ],
          [
            newValues.payoutRedemptionPeriodDays,
            newValues.minAssessmentDepositRatio,
            newValues.maxRewardNXM,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodDays,
        minAssessmentDepositRatio,
        maxRewardNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodDays).to.be.equal(newValues.payoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardNXM).to.be.equal(newValues.maxRewardNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { claims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardNXM: 3333,
      rewardRatio: 4444,
    };

    {
      const { maxRewardNXM: initialMaxRewardNXM, rewardRatio: initialRewardRatio } = await claims.config();
      await claims
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutRedemptionPeriodDays, uintParams.minAssessmentDepositRatio],
          [newValues.payoutRedemptionPeriodDays, newValues.minAssessmentDepositRatio],
        );
      const {
        payoutRedemptionPeriodDays,
        minAssessmentDepositRatio,
        maxRewardNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodDays).to.be.equal(newValues.payoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardNXM).to.be.equal(initialMaxRewardNXM);
      expect(rewardRatio).to.be.equal(initialRewardRatio);
    }

    {
      const {
        payoutRedemptionPeriodDays: initialPayoutRedemptionPeriodDays,
        minAssessmentDepositRatio: initialMinAssessmentDepositRatio,
      } = await claims.config();
      await claims
        .connect(governance)
        .updateUintParameters(
          [uintParams.maxRewardNXM, uintParams.rewardRatio],
          [newValues.maxRewardNXM, newValues.rewardRatio],
        );
      const {
        payoutRedemptionPeriodDays,
        minAssessmentDepositRatio,
        maxRewardNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodDays).to.be.equal(initialPayoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(initialMinAssessmentDepositRatio);
      expect(maxRewardNXM).to.be.equal(newValues.maxRewardNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const { claims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    {
      const newValues = {
        payoutRedemptionPeriodDays: 1,
        minAssessmentDepositRatio: 2,
        maxRewardNXM: 3,
        rewardRatio: 4,
      };
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.rewardRatio,
            uintParams.maxRewardNXM,
            uintParams.minAssessmentDepositRatio,
            uintParams.payoutRedemptionPeriodDays,
          ],
          [
            newValues.rewardRatio,
            newValues.maxRewardNXM,
            newValues.minAssessmentDepositRatio,
            newValues.payoutRedemptionPeriodDays,
          ],
        );
      const {
        payoutRedemptionPeriodDays,
        minAssessmentDepositRatio,
        maxRewardNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodDays).to.be.equal(newValues.payoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardNXM).to.be.equal(newValues.maxRewardNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }

    {
      const newValues = {
        payoutRedemptionPeriodDays: 5,
        minAssessmentDepositRatio: 6,
        maxRewardNXM: 7,
        rewardRatio: 8,
      };
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.maxRewardNXM,
            uintParams.payoutRedemptionPeriodDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.rewardRatio,
          ],
          [
            newValues.maxRewardNXM,
            newValues.payoutRedemptionPeriodDays,
            newValues.minAssessmentDepositRatio,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodDays,
        minAssessmentDepositRatio,
        maxRewardNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodDays).to.be.equal(newValues.payoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardNXM).to.be.equal(newValues.maxRewardNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });
});
