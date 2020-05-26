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

async function fundAndStake (token, staking, amount, contract, member) {
  await staking.updateParameter(ParamType.MAX_LEVERAGE, ether('2'), { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address

  await token.approve(staking.address, amount, { from: member });
  await staking.stake(amount, [contract], [amount], { from: member });
}

async function setBurnCycleGasLimit (staking, gasLimit) {
  return staking.updateParameter(ParamType.BURN_CYCLE_GAS_LIMIT, gasLimit, { from: governanceContract });
}

async function setRewardCycleGasLimit (staking, gasLimit) {
  return staking.updateParameter(ParamType.REWARD_CYCLE_GAS_LIMIT, gasLimit, { from: governanceContract });
}

async function setMinAllowedDeallocation(staking, amount) {
  return staking.updateParameter(ParamType.MIN_DEALLOCATION, amount, { from: governanceContract });
}

async function setDeallocateLockTime(staking, lockTime) {
  return staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('processFirstDeallocation', function () {

  beforeEach(setup);

  it('should update staker.pendingDeallocations when a deallocation is processed', async function () {

    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Set parameters
    await setBurnCycleGasLimit(staking, 50000000);
    await setRewardCycleGasLimit(staking, 50000000);
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocation
    const firstDealloc = ether('1');
    await staking.requestDeallocation([firstContract], [firstDealloc], 0, { from: memberOne });

    // Check staker.pendingDeallocation
    const pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(pendingDeallocation.eq(firstDealloc), `Expected pending deallocation to be ${firstDealloc}, found ${pendingDeallocation}`);

    // Process deallocation
    await time.increase(91 * 24 * 3600); // 91 days pass
    await staking.processPendingActions();

    // Check staker.pendingDeallocation after processing the deallocation
    const newPendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(newPendingDeallocation.eq(ether('0')), `Expected pending deallocation to be 0, found ${newPendingDeallocation}`);
  });
});
