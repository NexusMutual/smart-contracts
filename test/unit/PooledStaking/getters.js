const { ether, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants } = require('../utils');
const { ParamType } = constants;

const {
  members: [memberOne],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';
const fourthContract = '0x0000000000000000000000000000000000000004';

async function fundAndApprove (token, tokenController, staking, amount, member) {
  const maxExposure = '2';
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
}

async function setLockTime (staking, lockTime) {
  return staking.updateUintParameters(ParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('getters', function () {

  it('stakerContractStake', async function () {

    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndApprove(token, tokenController, staking, ether('300'), memberOne);
    await staking.depositAndStake(ether('300'), [firstContract], [ether('300')], { from: memberOne });

    const contracts = [firstContract, secondContract, thirdContract, fourthContract];
    const amounts = [ether('300'), ether('50'), ether('100'), ether('120')];
    await staking.depositAndStake(ether('0'), contracts, amounts, { from: memberOne });

    // Push a burn of 200
    await staking.pushBurn(firstContract, ether('200'), { from: internalContract });
    await staking.processPendingActions('100');

    // Check no stake is greater than the deposit
    const deposit = await staking.stakerDeposit(memberOne);
    for (let i = 0; i < contracts.length; i++) {
      const stake = await staking.stakerContractStake(memberOne, contracts[i]);
      assert(stake.lte(deposit));
    }
  });

  it('getCurrentRewardsRound', async function () {
    const { staking } = this;

    const roundDuration = (await staking.REWARD_ROUND_DURATION()).toNumber();
    const startTime = (await staking.REWARD_ROUNDS_START()).toNumber();
    const now = (await time.latest()).toNumber();
    let currentExpectedRound = now <= startTime ? 0 : Math.floor((now - startTime) / roundDuration);

    let currentRound = (await staking.getCurrentRewardsRound()).toNumber();
    assert.strictEqual(currentRound, currentExpectedRound);

    for (let i = 0; i < 5; i++) {
      await time.increase(await staking.REWARD_ROUND_DURATION());
      currentRound = (await staking.getCurrentRewardsRound()).toNumber();
      currentExpectedRound++;
      assert.strictEqual(currentRound, currentExpectedRound);
    }
  });
});
