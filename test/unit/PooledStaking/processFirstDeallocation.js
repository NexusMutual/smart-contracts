const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants } = require('../utils');
const setup = require('../setup');
const { ParamType } = constants;

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

async function setMinAllowedDeallocation (staking, amount) {
  return staking.updateParameter(ParamType.MIN_DEALLOCATION, amount, { from: governanceContract });
}

async function setDeallocateLockTime (staking, lockTime) {
  return staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('processFirstDeallocation', function () {

  beforeEach(setup);

  it('should have no pending actions after processing the deallocations', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocation
    const firstDealloc = ether('3');
    await staking.requestDeallocation([firstContract], [firstDealloc], 0, { from: memberOne });

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);

    let hasPendingActions = await staking.hasPendingActions();
    assert.isTrue(hasPendingActions, `Expected pending actions`);

    let processPendingActions = await staking.processPendingActions();
    expectEvent(processPendingActions, 'PendingActionsProcessed', {
      finished: true,
    });

    hasPendingActions = await staking.hasPendingActions();
    assert.isFalse(hasPendingActions, `Expected no more pending actions`);

    // Request multiple deallocations in a row
    for (let i = 0; i < 30; i++) {
      const lastDeallocationId = await staking.lastDeallocationId();
      const { next: nextId } = await staking.deallocationAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastDeallocationId;
      await staking.requestDeallocation([firstContract], [ether('3')], insertAfter, { from: memberOne });
    }

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);

    processPendingActions = await staking.processPendingActions();
    expectEvent(processPendingActions, 'PendingActionsProcessed', {
      finished: true,
    });

    hasPendingActions = await staking.hasPendingActions();
    assert.isFalse(hasPendingActions, `Expected no more pending actions`);
  });

  it('should update staker.pendingDeallocations correctly', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocation
    const firstDealloc = ether('3');
    await staking.requestDeallocation([firstContract], [firstDealloc], 0, { from: memberOne });

    let pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(
      pendingDeallocation.eq(ether('3')),
      `Expected staker.pendingDeallocation to be ${ether('3')},  found ${pendingDeallocation}`,
    );

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);
    await staking.processPendingActions();

    // Expect staker.pendingDeallocation = 0
    pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(
      pendingDeallocation.eq(ether('0')),
      `Expected staker.pendingDeallocation to be ${ether('0')},  found ${pendingDeallocation}`,
    );

    // Request multiple deallocations in a row
    for (let i = 0; i < 30; i++) {
      const lastDeallocationId = await staking.lastDeallocationId();
      const { next: nextId } = await staking.deallocationAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastDeallocationId;
      await staking.requestDeallocation([firstContract], [ether('3')], insertAfter, { from: memberOne });
    }

    await time.increase(91 * 24 * 3600);

    // Expect staker.pendingDeallocation = 90
    pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(
      pendingDeallocation.eq(ether('90')),
      `Expected staker.pendingDeallocation to be ${ether('00')},  found ${pendingDeallocation}`,
    );

    // Process actions
    await staking.processPendingActions();

    // Expect staker.pendingDeallocation = 0
    pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(
      pendingDeallocation.eq(ether('0')),
      `Expected staker.pendingDeallocation to be ${ether('0')},  found ${pendingDeallocation}`,
    );
  });

  it('should update staker.allocations correctly', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocation
    await staking.requestDeallocation([firstContract], [ether('10')], 0, { from: memberOne });

    let allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('100')),
      `Expected staker.pendingDeallocation to be ${ether('100')},  found ${allocation}`,
    );

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);
    await staking.processPendingActions();

    // Expect staker.allocation = 0
    allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('90')),
      `Expected staker.pendingDeallocation to be ${ether('90')},  found ${allocation}`,
    );

    // Request multiple deallocations in a row
    for (let i = 0; i < 30; i++) {
      const lastDeallocationId = await staking.lastDeallocationId();
      const { next: nextId } = await staking.deallocationAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastDeallocationId;
      await staking.requestDeallocation([firstContract], [ether('2')], insertAfter, { from: memberOne });
    }

    await time.increase(91 * 24 * 3600);

    // Expect staker.allocation = 90
    allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('90')),
      `Expected staker.pendingDeallocation to be ${ether('00')},  found ${allocation}`,
    );

    // Process actions
    await staking.processPendingActions();

    // Expect staker.allocation = 0
    allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('30')),
      `Expected staker.pendingDeallocation to be ${ether('30')},  found ${allocation}`,
    );
  });

  it('should update the next pointer of the first deallocation', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocations
    await staking.requestDeallocation([firstContract], [ether('30')], 0, { from: memberOne });

    await time.increase(10 * 24 * 3600); // 10 days
    await staking.requestDeallocation([firstContract], [ether('10')], 1, { from: memberOne });
    await staking.requestDeallocation([firstContract], [ether('20')], 2, { from: memberOne });

    await time.increase(81 * 24 * 3600);
    await staking.processPendingActions();
    const { next: firstNext } = await staking.deallocationAtIndex(0);
    assert(firstNext.eqn(2));

    await time.increase(10 * 24 * 3600);
    await staking.processPendingActions();
    const { next: secondNext } = await staking.deallocationAtIndex(0);
    assert(secondNext.eqn(0));
  });

  it('should only deallocate available amount if a burn occurs after requesting, but before processing', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocation
    const firstDealloc = ether('70');
    await staking.requestDeallocation([firstContract], [firstDealloc], 0, { from: memberOne });

    // Push and process burn
    await time.increase(10 * 24 * 3600);
    await staking.pushBurn(firstContract, ether('90'), { from: internalContract });
    await staking.processPendingActions();

    // Expect staker.pendingDeallocation = 70, even if the actual allocation is 10
    const pendingDeallocation = await staking.stakerContractPendingDeallocation(memberOne, firstContract, { from: memberOne });
    assert(
      pendingDeallocation.eq(ether('70')),
      `Expected staker.pendingDeallocation to be ${ether('70')},  found ${pendingDeallocation}`,
    );
    let allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('10')),
      `Expected allocation to be ${ether('10')}, found ${allocation}`,
    );

    await time.increase(81 * 24 * 3600);
    await staking.processPendingActions();

    // Only deallocated the remaining allocation (10), although originally requested 70
    allocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(
      allocation.eq(ether('0')),
      `Expected allocation to be ${ether('0')}, found ${allocation}`,
    );
  });

  it('should emit Deallocated event', async function () {

    const { token, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedDeallocation(staking, ether('1'));
    await setDeallocateLockTime(staking, 90 * 24 * 3600); // 90 days

    // Request deallocations
    await staking.requestDeallocation([firstContract], [ether('30')], 0, { from: memberOne });

    await time.increase(91 * 24 * 3600); // 91 days

    const process = await staking.processPendingActions();
    expectEvent(process, 'Deallocated', {
      contractAddress: firstContract,
      staker: memberOne,
      amount: ether('30'),
    });
  });

  // TODO: Add test for gas limit
});
