const { expect } = require('chai');

const uintParams = {
  payoutRedemptionPeriodInDays: 0,
  expectedPayoutRatio: 1,
  payoutDeductibleRatio: 2,
  maxRewardInNXMWad: 3,
  rewardRatio: 4,
};

describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
    const { incidents } = this.contracts;
    const {
      governanceContracts: [governance],
      members: [member],
    } = this.accounts;
    await expect(incidents.connect(member).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(incidents.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('sets each parameter to the given new values', async function () {
    const { incidents } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;
    const newValues = {
      payoutRedemptionPeriodInDays: 111,
      expectedPayoutRatio: 2222,
      payoutDeductibleRatio: 3333,
      maxRewardInNXMWad: 4444,
      rewardRatio: 5555,
    };

    {
      await incidents
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.expectedPayoutRatio,
            uintParams.payoutDeductibleRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.rewardRatio,
          ],
          [
            newValues.payoutRedemptionPeriodInDays,
            newValues.expectedPayoutRatio,
            newValues.payoutDeductibleRatio,
            newValues.maxRewardInNXMWad,
            newValues.rewardRatio,
          ],
        );
      const {
        payoutRedemptionPeriodInDays,
        expectedPayoutRatio,
        payoutDeductibleRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await incidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(expectedPayoutRatio).to.be.equal(newValues.expectedPayoutRatio);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const { incidents } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    {
      const newValues = {
        payoutRedemptionPeriodInDays: 111,
        payoutDeductibleRatio: 3333,
        rewardRatio: 5555,
      };

      const {
        maxRewardInNXMWad: initialMaxRewardInNXMWad,
        expectedPayoutRatio: initialExpectedPayoutRatio,
      } = await incidents.config();
      await incidents
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutRedemptionPeriodInDays, uintParams.payoutDeductibleRatio, uintParams.rewardRatio],
          [newValues.payoutRedemptionPeriodInDays, newValues.payoutDeductibleRatio, newValues.rewardRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        expectedPayoutRatio,
        payoutDeductibleRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await incidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(expectedPayoutRatio).to.be.equal(initialExpectedPayoutRatio);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(initialMaxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }

    {
      const newValues = {
        maxRewardInNXMWad: 666,
        expectedPayoutRatio: 777,
      };
      const {
        payoutRedemptionPeriodInDays: initialPayoutRedemptionPeriodInDays,
        payoutDeductibleRatio: initialPayoutDeductibleRatio,
        rewardRatio: initialRewardRatio,
      } = await incidents.config();
      await incidents
        .connect(governance)
        .updateUintParameters(
          [uintParams.maxRewardInNXMWad, uintParams.expectedPayoutRatio],
          [newValues.maxRewardInNXMWad, newValues.expectedPayoutRatio],
        );
      const {
        payoutRedemptionPeriodInDays,
        expectedPayoutRatio,
        payoutDeductibleRatio,
        maxRewardInNXMWad,
        rewardRatio,
      } = await incidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(initialPayoutRedemptionPeriodInDays);
      expect(expectedPayoutRatio).to.be.equal(newValues.expectedPayoutRatio);
      expect(payoutDeductibleRatio).to.be.equal(initialPayoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(initialRewardRatio);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const { incidents } = this.contracts;
    const {
      governanceContracts: [governance],
    } = this.accounts;

    {
      const newValues = {
        rewardRatio: 1,
        payoutDeductibleRatio: 2,
        maxRewardInNXMWad: 3,
        payoutRedemptionPeriodInDays: 4,
        expectedPayoutRatio: 5,
      };
      await incidents
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.rewardRatio,
            uintParams.payoutDeductibleRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.expectedPayoutRatio,
          ],
          [
            newValues.rewardRatio,
            newValues.payoutDeductibleRatio,
            newValues.maxRewardInNXMWad,
            newValues.payoutRedemptionPeriodInDays,
            newValues.expectedPayoutRatio,
          ],
        );
      const {
        rewardRatio,
        payoutDeductibleRatio,
        maxRewardInNXMWad,
        payoutRedemptionPeriodInDays,
        expectedPayoutRatio,
      } = await incidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(expectedPayoutRatio).to.be.equal(newValues.expectedPayoutRatio);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });
});
