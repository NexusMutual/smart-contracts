const { expect } = require('chai');

const uintParams = { payoutRedemptionPeriodInDays: 0, minAssessmentDepositRatio: 1, maxRewardInNXM: 2, rewardRatio: 3 };

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
      payoutRedemptionPeriodInDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardInNXM: 3333,
      rewardRatio: 4444,
    };

    {
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.maxRewardInNXM,
            uintParams.rewardRatio,
          ],
          [
            newValues.payoutRedemptionPeriodInDays,
            newValues.minAssessmentDepositRatio,
            newValues.maxRewardInNXM,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXM).to.be.equal(newValues.maxRewardInNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { claims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodInDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardInNXM: 3333,
      rewardRatio: 4444,
    };

    {
      const { maxRewardInNXM: initialMaxRewardNXM, rewardRatio: initialRewardRatio } = await claims.config();
      await claims
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutRedemptionPeriodInDays, uintParams.minAssessmentDepositRatio],
          [newValues.payoutRedemptionPeriodInDays, newValues.minAssessmentDepositRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXM).to.be.equal(initialMaxRewardNXM);
      expect(rewardRatio).to.be.equal(initialRewardRatio);
    }

    {
      const {
        payoutRedemptionPeriodInDays: initialPayoutRedemptionPeriodDays,
        minAssessmentDepositRatio: initialMinAssessmentDepositRatio,
      } = await claims.config();
      await claims
        .connect(governance)
        .updateUintParameters(
          [uintParams.maxRewardInNXM, uintParams.rewardRatio],
          [newValues.maxRewardInNXM, newValues.rewardRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(initialPayoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(initialMinAssessmentDepositRatio);
      expect(maxRewardInNXM).to.be.equal(newValues.maxRewardInNXM);
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
        payoutRedemptionPeriodInDays: 1,
        minAssessmentDepositRatio: 2,
        maxRewardInNXM: 3,
        rewardRatio: 4,
      };
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.rewardRatio,
            uintParams.maxRewardInNXM,
            uintParams.minAssessmentDepositRatio,
            uintParams.payoutRedemptionPeriodInDays,
          ],
          [
            newValues.rewardRatio,
            newValues.maxRewardInNXM,
            newValues.minAssessmentDepositRatio,
            newValues.payoutRedemptionPeriodInDays,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXM).to.be.equal(newValues.maxRewardInNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }

    {
      const newValues = {
        payoutRedemptionPeriodInDays: 5,
        minAssessmentDepositRatio: 6,
        maxRewardInNXM: 7,
        rewardRatio: 8,
      };
      await claims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.maxRewardInNXM,
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.rewardRatio,
          ],
          [
            newValues.maxRewardInNXM,
            newValues.payoutRedemptionPeriodInDays,
            newValues.minAssessmentDepositRatio,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXM,
        rewardRatio,
      } = await claims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXM).to.be.equal(newValues.maxRewardInNXM);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });
});
