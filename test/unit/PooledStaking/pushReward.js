const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants } = require('../utils');
const { StakingUintParamType } = constants;

const {
  members: [memberOne],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';

async function fundApproveDepositStake (token, tokenController, staking, amount, contract, member) {
  await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

describe('pushReward', function () {

  it('should revert when called by non internal contract', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isInternal(nonInternal), false);

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: nonInternal }),
      'Caller is not an internal contract',
    );
  });

  it('should emit RewardRequested event', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // Push reward
    const rewardAmount = ether('2');
    await staking.accumulateReward(firstContract, rewardAmount, { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    const reward = await staking.pushRewards([firstContract]);

    expectEvent(reward, 'RewardRequested', {
      contractAddress: firstContract,
      amount: rewardAmount,
    });
  });

  it('should update the rewards mapping correctly', async function () {
    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    // Push first reward
    const firstRewardAmount = ether('2');
    await staking.accumulateReward(firstContract, firstRewardAmount, { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

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

  it('should set lastRewardId correctly', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    let lastRewardId = await staking.lastRewardId();
    assert(lastRewardId.eqn(0), `Expected lastRewardId to be 0, found ${lastRewardId}`);

    // Push first reward
    await staking.accumulateReward(firstContract, ether('5'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    lastRewardId = await staking.firstReward();
    assert(lastRewardId.eqn(1), `Expected lastRewardId to be 1, found ${lastRewardId}`);

    await staking.processPendingActions('100');

    // Push second reward
    await staking.accumulateReward(firstContract, ether('1'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    lastRewardId = await staking.firstReward();
    assert(lastRewardId.eqn(2), `Expected firstReward to be 2, found ${lastRewardId}`);
  });

  it('should set firstReward correctly', async function () {

    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    let firstReward = await staking.firstReward();
    assert(firstReward.eqn(0), `Expected firstReward to be 0, found ${firstReward}`);

    // Push first reward
    await staking.accumulateReward(firstContract, ether('2'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    firstReward = await staking.firstReward();
    assert(firstReward.eqn(1), `Expected firstReward to be 1, found ${firstReward}`);

    await staking.processPendingActions('100');

    // Push second reward
    await staking.accumulateReward(firstContract, ether('4'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    firstReward = await staking.firstReward();
    assert(firstReward.eqn(2), `Expected firstBurn to be 2, found ${firstReward}`);
  });

});
