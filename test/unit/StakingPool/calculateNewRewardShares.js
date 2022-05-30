const { expect } = require('chai');
const {
  ethers: {
    utils: { parseUnits },
  },
} = require('hardhat');

const TRANCHE_DURATION =
  91 * // days
  24 * // hourss
  60 * // minutes
  60; // seconds

describe('calculateNewRewardShares', function () {
  it('grants bonus shares proportionally to the time left of the first active tranche', async function () {
    const { stakingPool, config } = this;

    const blockTimestamps = [
      1651104000, // Tranche 210 begins
      1652676480, // 1 fifth elapsed
      1653724800, // 1 third elapsed
      1655035200, // 1 half elapsed
      1658966399, // Last second of tranche 210
    ];

    const newStakeShares = parseUnits('27644437');
    const firstActiveTrancheId = 210;
    const firstActiveTrancheEnd = (firstActiveTrancheId + 1) * TRANCHE_DURATION;

    const expectedNewShares = blockTimestamps.map(t => {
      const firstActiveTrancheTimeLeft = firstActiveTrancheEnd - t;
      const expectedNewShares = newStakeShares.add(
        newStakeShares
          .mul(config.REWARD_BONUS_PER_TRANCHE_RATIO)
          .div(config.REWARD_BONUS_PER_TRANCHE_DENOMINATOR)
          .mul(firstActiveTrancheTimeLeft)
          .div(TRANCHE_DURATION),
      );
      return expectedNewShares;
    });

    let prevNewShares;
    for (const i in expectedNewShares) {
      const newRewardsShares = await stakingPool.calculateNewRewardShares(
        0, // initialStakeShares
        newStakeShares,
        firstActiveTrancheId,
        firstActiveTrancheId,
        blockTimestamps[i],
      );

      expect(newRewardsShares).to.be.equal(expectedNewShares[i]);

      // As time elapses, the new shares are decreased
      if (prevNewShares) {
        expect(prevNewShares).to.be.gt(newRewardsShares);
      }
      prevNewShares = newRewardsShares;
    }
  });

  it('grants REWARD_BONUS_PER_TRANCHE_RATIO worth of bonus shares for the entirety of each tranche', async function () {
    const { stakingPool, config } = this;

    const firstActiveTrancheStart = 1651104000;
    const newStakeShares = parseUnits('27644437');
    const firstActiveTrancheId = 210;

    for (let i = 0; i <= 8; i++) {
      const newRewardsShares = await stakingPool.calculateNewRewardShares(
        0, // initialStakeShares
        newStakeShares,
        firstActiveTrancheId + i,
        firstActiveTrancheId + i,
        firstActiveTrancheStart,
      );

      expect(newRewardsShares).to.be.equal(
        newStakeShares.add(
          newStakeShares
            .mul(i + 1)
            .mul(config.REWARD_BONUS_PER_TRANCHE_RATIO)
            .div(config.REWARD_BONUS_PER_TRANCHE_DENOMINATOR),
        ),
      );
    }
  });

  it('grants new rewards shares for new stake shares but not for already existing ones', async function () {
    const { stakingPool, config } = this;

    const firstActiveTrancheStart = 1651104000;
    const initialStakeShares = parseUnits('27644437');
    const newStakeShares = parseUnits('877');
    const firstActiveTrancheId = 210;

    for (let i = 0; i <= 8; i++) {
      const newRewardsShares = await stakingPool.calculateNewRewardShares(
        initialStakeShares,
        newStakeShares,
        firstActiveTrancheId + i,
        firstActiveTrancheId + i,
        firstActiveTrancheStart,
      );

      expect(newRewardsShares).to.be.equal(
        newStakeShares.add(
          newStakeShares
            .mul(i + 1)
            .mul(config.REWARD_BONUS_PER_TRANCHE_RATIO)
            .div(config.REWARD_BONUS_PER_TRANCHE_DENOMINATOR),
        ),
      );
    }
  });

  it('grants new bonus shares for extending the period of an existing deposit', async function () {
    const { stakingPool, config } = this;

    const firstActiveTrancheStart = 1651104000;
    const initialStakeShares = parseUnits('27644437');
    const firstActiveTrancheId = 210;

    for (let i = 1; i <= 8; i++) {
      const newRewardsShares = await stakingPool.calculateNewRewardShares(
        initialStakeShares,
        0,
        firstActiveTrancheId,
        firstActiveTrancheId + i,
        firstActiveTrancheStart,
      );

      expect(newRewardsShares).to.be.equal(
        initialStakeShares
          .mul(i)
          .mul(config.REWARD_BONUS_PER_TRANCHE_RATIO)
          .div(config.REWARD_BONUS_PER_TRANCHE_DENOMINATOR),
      );
    }
  });

  it('new reward shares are always grater than or equal to the new stake shares', async function () {
    const { stakingPool } = this;

    const blockTimestamps = [
      1651104000, // Tranche 210 begins
      1652676480, // 1 fifth elapsed
      1653724800, // 1 third elapsed
      1655035200, // 1 half elapsed
      1658966399, // Last second of tranche 210
    ];

    const newStakeShares = parseUnits('27644437');
    const firstActiveTrancheId = 210;

    for (const i in blockTimestamps) {
      const newRewardsShares = await stakingPool.calculateNewRewardShares(
        0, // initialStakeShares
        newStakeShares,
        firstActiveTrancheId,
        firstActiveTrancheId,
        blockTimestamps[i],
      );

      expect(newRewardsShares).to.be.gte(newStakeShares);
    }
  });
});
