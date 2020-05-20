const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  members: [memberOne],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';

async function fundAndStake (token, staking, amount, contract, member) {
  await staking.updateParameter(ParamType.MAX_LEVERAGE, ether('2'), { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address

  await token.approve(staking.address, amount, { from: member });
  await staking.stake(amount, [contract], [amount], { from: member });
}

describe('pushReward', function () {

  beforeEach(setup);

  it('should revert when called by non internal contract', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isInternal(nonInternal), false);

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: nonInternal }),
      'Caller is not an internal contract',
    );
  });

  it('should emit Rewarded event', async function () {

    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Push reward
    const rewardAmount = ether('2');
    const reward = await staking.pushReward(firstContract, rewardAmount, { from: internalContract });

    expectEvent(reward, 'Rewarded', {
      contractAddress: firstContract,
      amount: rewardAmount,
    });
  });

  it('should mint the reward amount in the PS contract', async function () {
    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Push reward
    const rewardAmount = ether('2');
    const reward = await staking.pushReward(firstContract, rewardAmount, { from: internalContract });

    const currentBalance = await token.balanceOf(staking.address);
    const expectedBalance = ether('12');

    assert(
      currentBalance.eq(expectedBalance),
      `Expected balance of staking contract ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should update the rewards mapping correctly', async function () {
    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Push first reward
    const firstRewardAmount = ether('2');
    await staking.pushReward(firstContract, firstRewardAmount, { from: internalContract });

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

    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);
    let lastRewardId = await staking.lastRewardId();
    assert(lastRewardId.eqn(0), `Expected lastRewardId to be 0, found ${lastRewardId}`);

    // Push first reward
    await staking.pushReward(firstContract, ether('5'), { from: internalContract });
    lastRewardId = await staking.firstReward();
    assert(lastRewardId.eqn(1), `Expected lastRewardId to be 1, found ${lastRewardId}`);

    await staking.processPendingActions();

    // Push second reward
    await staking.pushReward(firstContract, ether('1'), { from: internalContract });
    lastRewardId = await staking.firstReward();
    assert(lastRewardId.eqn(2), `Expected firstReward to be 2, found ${lastRewardId}`);
  });

  it('should set firstReward correctly', async function () {

    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    let firstReward = await staking.firstReward();
    assert(firstReward.eqn(0), `Expected firstReward to be 0, found ${firstReward}`);

    // Push first reward
    await staking.pushReward(firstContract, ether('2'), { from: internalContract });
    firstReward = await staking.firstReward();
    assert(firstReward.eqn(1), `Expected firstReward to be 1, found ${firstReward}`);

    await staking.processPendingActions();

    // Push second reward
    await staking.pushReward(firstContract, ether('4'), { from: internalContract });
    firstReward = await staking.firstReward();
    assert(firstReward.eqn(2), `Expected firstBurn to be 2, found ${firstReward}`);
  });

});
