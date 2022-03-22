const { expect } = require('chai');

const uintParams = {
  payoutRedemptionPeriodInDays: 0,
  minAssessmentDepositRatio: 1,
  maxRewardInNXMWad: 2,
  rewardRatio: 3,
};

describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
    const { individualClaims } = this.contracts;
    const {
      governanceContracts: [governance],
      members: [member],
    } = this.accounts;
    await expect(individualClaims.connect(member).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(individualClaims.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('sets each parameter to the given new values', async function () {
    const { individualClaims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodInDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardInNXMWad: 3333,
      rewardRatio: 4444,
    };

    {
      await individualClaims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.rewardRatio,
          ],
          [
            newValues.payoutRedemptionPeriodInDays,
            newValues.minAssessmentDepositRatio,
            newValues.maxRewardInNXMWad,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await individualClaims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { individualClaims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodInDays: 111,
      minAssessmentDepositRatio: 2222,
      maxRewardInNXMWad: 3333,
      rewardRatio: 4444,
    };

    {
      const {
        maxRewardInNXMWad: initialMaxRewardNXM,
        rewardRatio: initialRewardRatio,
      } = await individualClaims.config();
      await individualClaims
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutRedemptionPeriodInDays, uintParams.minAssessmentDepositRatio],
          [newValues.payoutRedemptionPeriodInDays, newValues.minAssessmentDepositRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await individualClaims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXMWad).to.be.equal(initialMaxRewardNXM);
      expect(rewardRatio).to.be.equal(initialRewardRatio);
    }

    {
      const {
        payoutRedemptionPeriodInDays: initialPayoutRedemptionPeriodDays,
        minAssessmentDepositRatio: initialMinAssessmentDepositRatio,
      } = await individualClaims.config();
      await individualClaims
        .connect(governance)
        .updateUintParameters(
          [uintParams.maxRewardInNXMWad, uintParams.rewardRatio],
          [newValues.maxRewardInNXMWad, newValues.rewardRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await individualClaims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(initialPayoutRedemptionPeriodDays);
      expect(minAssessmentDepositRatio).to.be.equal(initialMinAssessmentDepositRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const { individualClaims } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    {
      const newValues = {
        payoutRedemptionPeriodInDays: 1,
        minAssessmentDepositRatio: 2,
        maxRewardInNXMWad: 3,
        rewardRatio: 4,
      };
      await individualClaims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.rewardRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.minAssessmentDepositRatio,
            uintParams.payoutRedemptionPeriodInDays,
          ],
          [
            newValues.rewardRatio,
            newValues.maxRewardInNXMWad,
            newValues.minAssessmentDepositRatio,
            newValues.payoutRedemptionPeriodInDays,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await individualClaims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }

    {
      const newValues = {
        payoutRedemptionPeriodInDays: 5,
        minAssessmentDepositRatio: 6,
        maxRewardInNXMWad: 7,
        rewardRatio: 8,
      };
      await individualClaims
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.maxRewardInNXMWad,
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.minAssessmentDepositRatio,
            uintParams.rewardRatio,
          ],
          [
            newValues.maxRewardInNXMWad,
            newValues.payoutRedemptionPeriodInDays,
            newValues.minAssessmentDepositRatio,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        minAssessmentDepositRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await individualClaims.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(minAssessmentDepositRatio).to.be.equal(newValues.minAssessmentDepositRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });
});
