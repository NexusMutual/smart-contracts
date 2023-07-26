const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const uintParams = {
  payoutRedemptionPeriodInDays: 0,
  payoutDeductibleRatio: 2,
  maxRewardInNXMWad: 3,
  rewardRatio: 4,
};
describe('updateUintParameters', function () {
  it('can only be called by governance', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const {
      governanceContracts: [governance],
      members: [member],
    } = fixture.accounts;
    await expect(yieldTokenIncidents.connect(member).updateUintParameters([], [])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
    await expect(yieldTokenIncidents.connect(governance).updateUintParameters([], [])).not.to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('sets each parameter to the given new values', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;
    const newValues = {
      payoutRedemptionPeriodInDays: 111,
      payoutDeductibleRatio: 3333,
      maxRewardInNXMWad: 4444,
      rewardRatio: 5555,
    };

    {
      await yieldTokenIncidents
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.payoutRedemptionPeriodInDays,
            uintParams.payoutDeductibleRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.rewardRatio,
          ],
          [
            newValues.payoutRedemptionPeriodInDays,
            newValues.payoutDeductibleRatio,
            newValues.maxRewardInNXMWad,
            newValues.rewardRatio,
          ],
        );
      const { payoutRedemptionPeriodInDays, payoutDeductibleRatio, maxRewardInNXMWad, rewardRatio } =
        await yieldTokenIncidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });

  it('sets only the given parameters to the new values', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    {
      const newValues = {
        payoutRedemptionPeriodInDays: 111,
        payoutDeductibleRatio: 3333,
        rewardRatio: 5555,
      };

      const { maxRewardInNXMWad: initialMaxRewardInNXMWad } = await yieldTokenIncidents.config();
      await yieldTokenIncidents
        .connect(governance)
        .updateUintParameters(
          [uintParams.payoutRedemptionPeriodInDays, uintParams.payoutDeductibleRatio, uintParams.rewardRatio],
          [newValues.payoutRedemptionPeriodInDays, newValues.payoutDeductibleRatio, newValues.rewardRatio],
        );
      const { payoutRedemptionPeriodInDays, payoutDeductibleRatio, maxRewardInNXMWad, rewardRatio } =
        await yieldTokenIncidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(initialMaxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }

    {
      const newValues = { maxRewardInNXMWad: 666 };
      const {
        payoutRedemptionPeriodInDays: initialPayoutRedemptionPeriodInDays,
        payoutDeductibleRatio: initialPayoutDeductibleRatio,
        rewardRatio: initialRewardRatio,
      } = await yieldTokenIncidents.config();
      await yieldTokenIncidents
        .connect(governance)
        .updateUintParameters([uintParams.maxRewardInNXMWad], [newValues.maxRewardInNXMWad]);
      const { payoutRedemptionPeriodInDays, payoutDeductibleRatio, maxRewardInNXMWad, rewardRatio } =
        await yieldTokenIncidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(initialPayoutRedemptionPeriodInDays);
      expect(payoutDeductibleRatio).to.be.equal(initialPayoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(initialRewardRatio);
    }
  });

  it('allows parameters to be given in any order', async function () {
    const fixture = await loadFixture(setup);
    const { yieldTokenIncidents } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    {
      const newValues = {
        rewardRatio: 1,
        payoutDeductibleRatio: 2,
        maxRewardInNXMWad: 3,
        payoutRedemptionPeriodInDays: 4,
      };
      await yieldTokenIncidents
        .connect(governance)
        .updateUintParameters(
          [
            uintParams.rewardRatio,
            uintParams.payoutDeductibleRatio,
            uintParams.maxRewardInNXMWad,
            uintParams.payoutRedemptionPeriodInDays,
          ],
          [
            newValues.rewardRatio,
            newValues.payoutDeductibleRatio,
            newValues.maxRewardInNXMWad,
            newValues.payoutRedemptionPeriodInDays,
          ],
        );
      const { rewardRatio, payoutDeductibleRatio, maxRewardInNXMWad, payoutRedemptionPeriodInDays } =
        await yieldTokenIncidents.config();

      expect(payoutRedemptionPeriodInDays).to.be.equal(newValues.payoutRedemptionPeriodInDays);
      expect(payoutDeductibleRatio).to.be.equal(newValues.payoutDeductibleRatio);
      expect(maxRewardInNXMWad).to.be.equal(newValues.maxRewardInNXMWad);
      expect(rewardRatio).to.be.equal(newValues.rewardRatio);
    }
  });
});
