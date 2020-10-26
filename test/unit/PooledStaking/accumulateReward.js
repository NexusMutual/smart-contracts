const { ether, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants, helpers: { expectRevert } } = require('../utils');
const { ParamType } = constants;

const {
  members: [memberOne],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundApproveDepositStake (token, tokenController, staking, amount, contract, member) {
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

describe('accumulateReward', function () {

  it('should revert when called by non internal contract', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isInternal(nonInternal), false);

    await expectRevert(
      staking.accumulateReward(firstContract, ether('1'), { from: nonInternal }),
      'Caller is not an internal contract',
    );
  });

  it('should emit RewardAdded event', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // Add reward
    const rewardAmount = ether('2');
    const rewardAdded = await staking.accumulateReward(firstContract, rewardAmount, { from: internalContract });

    expectEvent(rewardAdded, 'RewardAdded', {
      contractAddress: firstContract,
      amount: rewardAmount,
    });
  });

  it('should sum up added rewards', async function () {
    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // Push first reward
    const firstRewardAmount = ether('2');
    const secondRewardAmount = ether('3');
    const pushedRewardAmount = firstRewardAmount.add(secondRewardAmount);

    await staking.accumulateReward(firstContract, firstRewardAmount, { from: internalContract });
    await staking.accumulateReward(firstContract, secondRewardAmount, { from: internalContract });

    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    // Check the Reward has been pushed to the rewards mapping
    const { amount, rewardedAt, contractAddress } = await staking.rewards(1);
    const now = await time.latest();
    assert(
      amount.eq(pushedRewardAmount),
      `Expected first reward amount to be ${pushedRewardAmount}, found ${amount}`,
    );
    assert.equal(
      contractAddress,
      firstContract,
      `Expected rewarded contract to be ${firstContract}, found ${contractAddress}`,
    );
    assert(
      rewardedAt.eq(now),
      `Expected rewarded time to be ${now}, found ${rewardedAt}`,
    );
  });

  it('should automatically push reward on new round time reached', async function () {
    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // Push first reward
    const firstRewardAmount = ether('2');
    const secondRewardAmount = ether('3');

    await staking.accumulateReward(firstContract, firstRewardAmount, { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.accumulateReward(firstContract, secondRewardAmount, { from: internalContract });

    // Check the Reward has been pushed to the rewards mapping
    const { amount, rewardedAt, contractAddress } = await staking.rewards(1);
    const now = await time.latest();
    assert(
      amount.eq(firstRewardAmount),
      `Expected first reward amount to be ${firstRewardAmount}, found ${amount}`,
    );
    assert.equal(
      contractAddress,
      firstContract,
      `Expected rewarded contract to be ${firstContract}, found ${contractAddress}`,
    );
    assert(
      rewardedAt.eq(now),
      `Expected rewarded time to be ${now}, found ${rewardedAt}`,
    );
  });

  it('should set firstReward and lastRewardId correctly', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    let firstReward = await staking.firstReward();
    let lastRewardId = await staking.lastRewardId();

    assert(firstReward.eqn(0), `Expected firstReward to be 0, found ${firstReward}`);
    assert(lastRewardId.eqn(0), `Expected lastRewardId to be 0, found ${lastRewardId}`);

    // Push first reward
    await staking.accumulateReward(firstContract, ether('2'), { from: internalContract });
    await staking.accumulateReward(secondContract, ether('4'), { from: internalContract });
    await staking.accumulateReward(thirdContract, ether('13'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([secondContract, firstContract, thirdContract]);

    firstReward = await staking.firstReward();
    lastRewardId = await staking.lastRewardId();

    assert(firstReward.eqn(1), `Expected firstReward to be 1, found ${firstReward}`);
    assert(lastRewardId.eqn(3), `Expected lastRewardId to be 2, found ${lastRewardId}`);
  });

  it('should not push the same contract multiple times in the same round', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    let lastRewardId = await staking.lastRewardId();
    assert(lastRewardId.eqn(0), `Expected lastRewardId to be 0, found ${lastRewardId}`);

    await staking.accumulateReward(firstContract, ether('2'), { from: internalContract });
    await staking.accumulateReward(firstContract, ether('3'), { from: internalContract });
    await staking.accumulateReward(secondContract, ether('4'), { from: internalContract });

    await time.increase(await staking.REWARD_ROUND_DURATION());
    // attempt push with firstContract twice in the array:
    await staking.pushRewards([firstContract, firstContract]);
    // attempt an additional push:
    await staking.pushRewards([firstContract]);

    lastRewardId = await staking.lastRewardId();
    assert(lastRewardId.eqn(1), `Expected lastRewardId to be 1, found ${lastRewardId}`);
  });

  it('should clear accumulated value of the last round and set lastDistributionRound', async function () {

    const { token, tokenController, staking } = this;
    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // initial
    let accumulated = await staking.accumulatedRewards(firstContract);
    let expAmount = ether('0');

    assert(accumulated.amount.eq(expAmount), `Expected amount to be ${expAmount}, found ${accumulated.amount}`);
    assert(
      accumulated.lastDistributionRound.eqn(0),
      `Expected lastDistributionRound to be 0, found ${accumulated.lastDistributionRound}`,
    );

    // accumulate
    await staking.accumulateReward(firstContract, ether('3'), { from: internalContract });
    await staking.accumulateReward(firstContract, ether('7'), { from: internalContract });
    await staking.accumulateReward(secondContract, ether('5'), { from: internalContract });

    let currentRound = await staking.getCurrentRewardsRound();

    // accumulated
    accumulated = await staking.accumulatedRewards(firstContract);
    expAmount = ether('10');

    assert(accumulated.amount.eq(expAmount), `Expected amount to be ${expAmount}, found ${accumulated.amount}`);
    assert(
      accumulated.lastDistributionRound.eqn(currentRound.toNumber()),
      `Expected lastDistributionRound to be 0, found ${accumulated.lastDistributionRound}`,
    );

    // push
    await time.increase(await staking.REWARD_ROUND_DURATION());
    currentRound = await staking.getCurrentRewardsRound();

    await staking.pushRewards([firstContract, secondContract]);

    // next round
    accumulated = await staking.accumulatedRewards(firstContract);
    expAmount = ether('0');

    assert(accumulated.amount.eq(expAmount), `Expected amount to be ${expAmount}, found ${accumulated.amount}`);

    assert(
      accumulated.lastDistributionRound.eq(currentRound),
      `Expected lastDistributionRound to be ${currentRound}, found ${accumulated.lastDistributionRound}`,
    );
  });

});
