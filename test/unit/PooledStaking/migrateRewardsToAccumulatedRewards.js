const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { assert } = require('chai');

const { accounts, constants, helpers } = require('../utils');
const setup = require('../setup');
const { logEvents } = helpers;
const { ParamType } = constants;

const BN = web3.utils.BN;

const {
  members: [memberOne],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';
const fourthContract = '0x0000000000000000000000000000000000000004';

describe.only('migrateRewardsToAccumulatedRewards', function () {
  beforeEach(setup);

  async function assertAccumulatedRewards (staking, rewards) {
    const expectedAggregated = {};
    for (const reward of rewards) {
      if (!expectedAggregated[reward.contractAddress]) {
        expectedAggregated[reward.contractAddress] = new BN('0');
      }
      expectedAggregated[reward.contractAddress] = expectedAggregated[reward.contractAddress].add(reward.amount);
    }

    for (const contractAddress of Object.keys(expectedAggregated)) {
      const expectedAccumulatedReward = expectedAggregated[contractAddress];
      const accumulated = await staking.accumulatedRewards(contractAddress);
      assert.strictEqual(
        accumulated.amount.toString(), expectedAccumulatedReward.toString(), `accumulatedRewards does not match for ${contractAddress}`,
      );
      assert.strictEqual(
        accumulated.lastDistributionRound.toString(), '0', `accumulatedRewards does not match for ${contractAddress}`,
      );
    }
  }

  it('skips migration if no rewards are present', async function () {
    const { staking } = this;
    // reset to pre-initialization state
    staking.setRewardRoundStart(0);

    const rewards = [
      { contractAddress: firstContract, amount: ether('1') },
      { contractAddress: secondContract, amount: ether('2') },
    ];
    for (const reward of rewards) {
      await staking.legacy_pushReward(reward.contractAddress, reward.amount);
    }

    await staking.initializeRewardRoundsStart();

    await staking.processPendingActions('100');

    const maxIterations = 4;
    await expectRevert(
      staking.migrateRewardsToAccumulatedRewards(maxIterations),
      'Nothing to migrate',
    );
  });

  it('migrates existing rewards accumulatedRewards with contracts occurring multiple times', async function () {
    const { staking } = this;

    // reset to pre-initialization state
    staking.setRewardRoundStart(0);

    const rewards = [
      { contractAddress: firstContract, amount: ether('1') },
      { contractAddress: secondContract, amount: ether('2') },
      { contractAddress: secondContract, amount: ether('3') },
      { contractAddress: firstContract, amount: ether('6') },
      { contractAddress: thirdContract, amount: ether('8') },
      { contractAddress: firstContract, amount: ether('9') },
    ];

    for (const reward of rewards) {
      await staking.legacy_pushReward(reward.contractAddress, reward.amount);
    }

    await staking.initializeRewardRoundsStart();

    const maxIterations = 4;
    const migrationRun1 = await staking.migrateRewardsToAccumulatedRewards(maxIterations);

    expectEvent(migrationRun1, 'RewardsMigrationCompleted', {
      finished: false,
      iterationsLeft: '0',
      firstReward: (maxIterations + 1).toString(),
    });

    const migrationRun2 = await staking.migrateRewardsToAccumulatedRewards(maxIterations);
    expectEvent(migrationRun2, 'RewardsMigrationCompleted', {
      finished: true,
      iterationsLeft: (2 * maxIterations - rewards.length).toString(),
      firstReward: '0',
    });

    await assertAccumulatedRewards(staking, rewards);

    // reward queue is empty
    const firstRewardId = await staking.firstReward();
    assert.strictEqual(firstRewardId.toString(), '0');

    await expectRevert(
      staking.migrateRewardsToAccumulatedRewards(maxIterations),
      'Nothing to migrate',
    );
  });

  it('migrates existing rewards accumulatedRewards and skips the delayed rewards (post round initialization)', async function () {
    const { staking } = this;

    // reset to pre-initialization state
    staking.setRewardRoundStart(0);

    const rewards = [
      { contractAddress: firstContract, amount: ether('1') },
      { contractAddress: secondContract, amount: ether('2') },
    ];

    for (const reward of rewards) {
      await staking.legacy_pushReward(reward.contractAddress, reward.amount);
    }

    await staking.initializeRewardRoundsStart();

    const delayedReward = { contractAddress: fourthContract, amount: ether('13') };
    await staking.legacy_pushReward(delayedReward.contractAddress, delayedReward.amount);

    const expectedFirstReward = rewards.length + 1;

    const maxIterations = 10;
    const migration = await staking.migrateRewardsToAccumulatedRewards(maxIterations);
    expectEvent(migration, 'RewardsMigrationCompleted', {
      finished: true,
      iterationsLeft: (maxIterations - rewards.length).toString(),
      firstReward: expectedFirstReward.toString(),
    });

    assertAccumulatedRewards(staking, rewards);
    // remaining reward is the delayed reward.
    const firstRewardId = await staking.firstReward();
    const lastRewardId = await staking.lastRewardId();
    const remainingReward = await staking.rewards(firstRewardId);
    assert.strictEqual(expectedFirstReward, firstRewardId.toNumber());
    assert.strictEqual(rewards.length + 1, lastRewardId.toNumber());
    assert.strictEqual(remainingReward.contractAddress.toString(), delayedReward.contractAddress.toString());
    assert.strictEqual(remainingReward.amount.toString(), delayedReward.amount.toString());

    await expectRevert(
      staking.migrateRewardsToAccumulatedRewards(maxIterations),
      'Exceeded last migration id',
    );

    await staking.processPendingActions('100');

    await expectRevert(
      staking.migrateRewardsToAccumulatedRewards(maxIterations),
      'Nothing to migrate',
    );

    const delayedReward2 = { contractAddress: fourthContract, amount: ether('14') };
    await staking.legacy_pushReward(delayedReward2.contractAddress, delayedReward2.amount);

    await expectRevert(
      staking.migrateRewardsToAccumulatedRewards(maxIterations),
      'Exceeded last migration id',
    );
  });
});
