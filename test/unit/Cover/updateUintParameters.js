const { expect } = require('chai');

describe('updateUintParameters', function () {
  const GLOBAL_REWARDS_RATIO = 2;
  const GLOBAL_CAPACITY_RATIO = 3;

  it('should revert if caller is not governance', async function () {
    const { cover, accounts } = this;

    await expect(cover.connect(accounts.nonMembers[0]).updateUintParameters([0], ['0'])).to.be.revertedWith(
      'Caller is not authorized to govern',
    );
  });

  it('should allow to update globalRewardsRatio', async function () {
    const { cover, accounts } = this;

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([1], [GLOBAL_REWARDS_RATIO]);
    const globalRewardsRatio = await cover.globalRewardsRatio();

    expect(globalRewardsRatio).to.be.eq(GLOBAL_REWARDS_RATIO);
  });

  it('should allow to update globalCapacityRatio', async function () {
    const { cover, accounts } = this;

    await cover.connect(accounts.governanceContracts[0]).updateUintParameters([0], [GLOBAL_CAPACITY_RATIO]);
    const globalCapacityRatio = await cover.globalCapacityRatio();

    expect(globalCapacityRatio).to.be.eq(GLOBAL_CAPACITY_RATIO);
  });

  it('should allow to update all parameters', async function () {
    const { cover, accounts } = this;

    await cover
      .connect(accounts.governanceContracts[0])
      .updateUintParameters([0, 1, 2], [GLOBAL_CAPACITY_RATIO, GLOBAL_REWARDS_RATIO]);

    expect(await cover.globalCapacityRatio()).to.be.eq(GLOBAL_CAPACITY_RATIO);
    expect(await cover.globalRewardsRatio()).to.be.eq(GLOBAL_REWARDS_RATIO);
  });
});
