const { expectRevert, expectEvent, ether, time } = require('@openzeppelin/test-helpers');

const { assert, expect } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType } = require('../utils').constants;
const { filterArgsKeys } = require('../utils').helpers;

const setup = require('../setup');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';

async function fundApproveStake (token, staking, amount, contracts, allocations, member) {
  const maxExposure = '10';
  const minAllocation = ether('2');

  await staking.updateParameter(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });
  await staking.updateParameter(ParamType.MIN_UNSTAKE, ether('2'), { from: governanceContract });
  await staking.updateParameter(ParamType.MIN_STAKE, minAllocation, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });

  await staking.depositAndStake(amount, contracts, allocations, { from: member });
}

async function setUnstakeLockTime (staking, lockTime) {
  return staking.updateParameter(ParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
}

async function setMinUnstake (staking, amount) {
  return staking.updateParameter(ParamType.MIN_UNSTAKE, amount, { from: governanceContract });
}

describe('createUnstakeRequest', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.createUnstakeRequest([firstContract], [1], 0, { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert when contracts and amounts arrays lengths differ', async function () {

    const { staking } = this;

    await expectRevert(
      staking.createUnstakeRequest([firstContract, secondContract], [1], 0, { from: memberOne }),
      'Contracts and amounts arrays should have the same length',
    );
  });

  it('should revert if insertAfter > lastUnstakeRequestId', async function () {

    const { staking, token } = this;

    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);
    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // index does not exist
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 5, { from: memberOne }),
      'Invalid unstake request id provided',
    );

    // insert first request
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
    // expect last unstake request id to be 1
    let lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(1), `expected last unstake request id to be 1, found ${lastUnstakeRequestId}`);

    // insert second
    await staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne });
    // expect last unstake request id to be 2
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(2), `expected last unstake request id to be 2, found ${lastUnstakeRequestId}`);

    // expect insertAfter = 3 to be invalid
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 3, { from: memberOne }),
      'Invalid unstake request id provided',
    );
  });

  it('should revert when insertAfter index is an empty slot', async function () {

    const { staking, token } = this;

    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);
    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // push 2 unstake requests
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
    await staking.createUnstakeRequest([firstContract], [ether('3')], 1, { from: memberOne });

    // 91 days pass and process pending actions
    const targetTime = lockTime + (24 * 3600); // 91 days
    await time.increase(targetTime);
    await staking.processPendingActions();

    // can't insert after an empty slot
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('4')], 1, { from: memberOne }),
      'Provided unstake request id should not be an empty slot',
    );

    // can insert after index 0
    await staking.createUnstakeRequest([firstContract], [ether('5')], 0, { from: memberOne });
  });

  it('should revert when there\'s nothing to deallocate on a contract', async function () {

    const { staking, token } = this;

    // Nothing staked on the contract
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('1')], 0, { from: memberOne }),
      'Nothing to unstake on this contract',
    );

    // deposit 10 and stake [10, 10] on 2 contracts
    await fundApproveStake(token, staking, ether('10'), [firstContract, secondContract], [ether('10'), ether('7')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // request unstake of 10 on firstcontract
    await staking.createUnstakeRequest([firstContract], [ether('10')], 0, { from: memberOne });

    // request unstake of 1 on firstContract
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('1')], 1, { from: memberOne }),
      'Nothing to unstake on this contract',
    );
  });

  it('should revert when deallocating more than allocated', async function () {

    const { staking, token } = this;

    // deposit 10 and stake 10 on firstContract
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // Request unstake of 11 on firstContract
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('11')], 0, { from: memberOne }),
      'Cannot unstake more than staked',
    );

    // Request unstake of 7 on firstContract
    await staking.createUnstakeRequest([firstContract], [ether('7')], 0, { from: memberOne });

    // Request unstake of 4, (staked = 10; pending unstake requests = 7; max that can be unstaked is 3)
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('4')], 0, { from: memberOne }),
      'Cannot unstake more than staked',
    );
  });

  it('should revert when requested unstake < MIN_UNSTAKE', async function () {

    const { staking, token } = this;

    // deposit 10 and stake 10 on firstContract; MIN_UNSTAKE = 2
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // Request unstake of 1 (< MIN_UNSTAKE)
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('1')], 0, { from: memberOne }),
      'Unstaked amount cannot be less than minimum unstake amount',
    );

    // Request unstake of 2 (= MIN_UNSTAKE)
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
  });

  it('should revert when final allocation is less than MIN_STAKE', async function () {

    const { staking, token } = this;

    // deposit 10 and stake 10 on firt contract; MIN_STAKE = 2
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // request unstake of 9 that would decrease stake to 1 (< MIN_STAKE)
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('9')], 0, { from: memberOne }),
      'Remaining stake cannot be less than minimum unstake amount',
    );

    // request unstake of 9, that would decrease stake to 2 (= MIN_STAKE)
    staking.createUnstakeRequest([firstContract], [ether('8')], 0, { from: memberOne });
  });

  it('should revert if requested unstake time < unstake time at insertAfter index', async function () {

    const { staking, token } = this;

    // deposit 20 and stake 20 on firstContract, UNSTAKE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // first unstake request, with lock time 90
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });

    // 1h passes
    time.increase(3600);

    // decrease UNSTAKE_LOCK_TIME to 30
    const newLockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, newLockTime);

    // second unstake request can't be inserted after 1 (due time < due time at index 1)
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne }),
      'Unstake request time must be greater or equal to previous unstake request',
    );

    // third unstake request requested successfully when added after index 0
    // new state: 2 -> 1
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });

    // fourth unstake request requested inserted successfully after index 2,
    // as unstakeAt is the same for both (same block)
    // new state: 2 -> 3 -> 1
    await staking.createUnstakeRequest([firstContract], [ether('2')], 2, { from: memberOne });
  });

  it('should revert if requested unstake time >= unstake time at next of insertAfter index', async function () {

    const { staking, token } = this;

    let lastUnstakeRequestId;

    // deposit 10 and stake 10 on firstContract, UNSTAKE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // First unstake request
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
    // lastUnstakeRequestId should be 1
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(1));

    // 1h passes
    time.increase(3600);

    // Second unstake request, can be inserted after index 1
    // New state: 1 -> 2
    await staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne });
    // lastUnstakeRequestId should be 2
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(2));

    // Third unstake request, due at the same time index 2 (same lock time, same block),
    // can't be inserted after 1
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne }),
      'Next unstake request time must be greater than new unstake request time',
    );

    // Fourth unstake request, due at the same time as index 2 (same lock time, same block),
    // it can be inserted after index 2
    // New state: 1 -> 2 -> 3
    await staking.createUnstakeRequest([firstContract], [ether('2')], 2, { from: memberOne });
    // lastUnstakeRequestId should be 3
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(3));

    // 1h passes
    time.increase(3600);

    // Fifth unstake request, cannot be inserted after index 2, as
    // it's due after the request at index 2, but also after the request at index 3
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 2, { from: memberOne }),
      'Next unstake request time must be greater than new unstake request time',
    );
  });

  it('ensure the created unstake request is inserted in the unstakeRequests mapping', async function () {

    const { staking, token } = this;

    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    const latestBlockTime = await time.latest();
    const unstakeTime = latestBlockTime.addn(90 * 24 * 3600);

    const unstakeRequests = [
      {
        amount: ether('2'),
        unstakeAt: unstakeTime,
        contractAddress: firstContract,
        stakerAddress: memberOne,
        next: '2',
      },
      {
        amount: ether('3'),
        unstakeAt: unstakeTime,
        contractAddress: firstContract,
        stakerAddress: memberOne,
        next: '3',
      },
      {
        amount: ether('4'),
        unstakeAt: unstakeTime,
        contractAddress: firstContract,
        stakerAddress: memberOne,
        next: '0',
      },
    ];

    // create a few unstake requests
    for (let i = 0; i < unstakeRequests.length; i++) {
      const { contractAddress, amount } = unstakeRequests[i];
      await staking.createUnstakeRequest([contractAddress], [amount], i, { from: memberOne });
    }

    // Fetch the actual unstake requests (always starting with index 1) and check their content is as expected
    for (let i = 1; i <= unstakeRequests.length; i++) {
      const actualRequest = await staking.unstakeRequestAtIndex(i);
      assert.deepEqual(filterArgsKeys(actualRequest), filterArgsKeys(unstakeRequests[i - 1]));
    }
  });

  it('ensure that next pointer of the new request points to the next of request at index insertAfter', async function () {
    const { staking, token } = this;

    let lastUnstakeRequestId;
    let lockTime;

    // deposit 20 and stake 20 on firstContract, UNSTAKE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Set UNSTAKE_LOCK_TIME to 30 days
    lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    // First unstake request
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });

    // New state: 0 -> 1 -> 0
    // Next pointer should be 0
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(1), `expected lastUnstakeRequestId to be 1, found ${lastUnstakeRequestId}`);
    const { next: nextIndexOne } = await staking.unstakeRequestAtIndex(lastUnstakeRequestId);
    assert(nextIndexOne.eqn(0), `expected next index to be 0, found ${nextIndexOne.toString()}`);

    // Set UNSTAKE_LOCK_TIME to 60 days
    lockTime = 60 * 24 * 3600; // 60 days
    await setUnstakeLockTime(staking, lockTime);

    // Second unstake request, after index 1
    await staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne });

    // New state: 0 -> 1 -> 2 -> 0
    // Next pointer should be 0
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(2), `expected lastUnstakeRequestId to be 2, found ${lastUnstakeRequestId}`);
    const { next: nextIndexTwo } = await staking.unstakeRequestAtIndex(lastUnstakeRequestId);
    assert(nextIndexTwo.eqn(0), `expected next index to be 0, found ${nextIndexTwo.toString()}`);

    // Set UNSTAKE_LOCK_TIME to 50 days
    lockTime = 50 * 24 * 3600; // 50 days
    await setUnstakeLockTime(staking, lockTime);

    // Third unstake request, after index 1
    await staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne });

    // New state: 0 -> 1 -> 3 -> 2 -> 0
    // Next pointer for 3 should be 2
    lastUnstakeRequestId = await staking.lastUnstakeRequestId();
    assert(lastUnstakeRequestId.eqn(3), `expected lastUnstakeRequestId to be 3, found ${lastUnstakeRequestId}`);
    const { next: nextIndexThree } = await staking.unstakeRequestAtIndex(lastUnstakeRequestId);
    assert(nextIndexThree.eqn(2), `expected next index to be 2, found ${nextIndexThree}`);
  });

  it('ensure that next pointer of the request at insertAfter index points to the new request', async function () {
    const { staking, token } = this;

    let insertAfter;
    let lockTime;

    // deposit 20 and stake 20 on firstContract, UNSTAKE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Set UNSTAKE_LOCK_TIME to 30 days
    lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    // First unstake request
    insertAfter = 0;
    await staking.createUnstakeRequest([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 0
    // Next pointer of request at insertAfter should be 1
    const { next: nextIndexOne } = await staking.unstakeRequestAtIndex(insertAfter);
    assert(nextIndexOne.eqn(1), `expected next index to be 1, found ${nextIndexOne}`);

    // Set UNSTAKE_LOCK_TIME to 60 days
    lockTime = 60 * 24 * 3600; // 60 days
    await setUnstakeLockTime(staking, lockTime);

    // Second unstake request, after index 1
    insertAfter = 1;
    await staking.createUnstakeRequest([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 2 -> 0
    // Next pointer of request at insertAfter should be 2
    const { next: nextIndexTwo } = await staking.unstakeRequestAtIndex(insertAfter);
    assert(nextIndexTwo.eqn(2), `expected next index to be 2, found ${nextIndexTwo}`);

    // Set UNSTAKE_LOCK_TIME to 50 days
    lockTime = 50 * 24 * 3600; // 50 days
    await setUnstakeLockTime(staking, lockTime);

    // Third unstake request, after index 1
    insertAfter = 1;
    await staking.createUnstakeRequest([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 3 -> 2 -> 0
    // Next pointer of request at indexAfter should be 3
    const { next: nextIndexThree } = await staking.unstakeRequestAtIndex(insertAfter);
    assert(nextIndexThree.eqn(3), `expected next index to be 2, found ${nextIndexThree}`);
  });

  it('ensure the request is inserted correctly when entry at indexAfter is empty', async function () {
    const { staking, token } = this;

    // deposit 20 and stake 20 on firstContract, UNSTAKE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Set UNSTAKE_LOCK_TIME to 30 days
    const lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    // First unstake request
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
    await staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne });

    // Next pointer of request at insertAfter should be 1
    const { next: nextIndexOne } = await staking.unstakeRequestAtIndex(0);
    assert(nextIndexOne.eqn(1), `expected next index to be 1, found ${nextIndexOne}`);

    // Time to process the first two unstake request requests
    await time.increase(lockTime + 1);
    await staking.processPendingActions();

    const hasPendingActions = await staking.hasPendingActions();
    assert.isFalse(hasPendingActions);

    // Test invalid insertion points
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne }),
      'Provided unstake request id should not be an empty slot',
    );

    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 2, { from: memberOne }),
      'Provided unstake request id should not be an empty slot',
    );

    // Third unstake request, after index 0
    await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });
    const { next: nextIndexThree } = await staking.unstakeRequestAtIndex(0);
    assert(nextIndexThree.eqn(3), `expected next index to be 3, found ${nextIndexThree}`);

    // Test invalid insertion points
    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne }),
      'Next unstake request time must be greater than new unstake request time',
    );

    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 1, { from: memberOne }),
      'Provided unstake request id should not be an empty slot',
    );

    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 2, { from: memberOne }),
      'Provided unstake request id should not be an empty slot',
    );

    await expectRevert(
      staking.createUnstakeRequest([firstContract], [ether('2')], 4, { from: memberOne }),
      'Invalid unstake request id provided',
    );

    // Fourth unstake request, after index 3
    await staking.createUnstakeRequest([firstContract], [ether('2')], 3, { from: memberOne });

    const { next: firstDeallocationId } = await staking.unstakeRequestAtIndex(0);
    assert(firstDeallocationId.eqn(3), `expected next index to be 3, found ${firstDeallocationId}`);

    const { next: nextIndexFour } = await staking.unstakeRequestAtIndex(3);
    assert(nextIndexFour.eqn(4), `expected next index to be 4, found ${nextIndexFour}`);
  });

  it('should emit UnstakeRequested event', async function () {
    const { staking, token } = this;

    // deposit 20 and stake 20 on firstContract, lock time 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    const lockTime = 90 * 24 * 3600; // 90 days
    await setUnstakeLockTime(staking, lockTime);

    // request unstake
    const request = await staking.createUnstakeRequest([firstContract], [ether('2')], 0, { from: memberOne });

    const latestBlockTime = await time.latest();
    const expectedDeallocateTime = latestBlockTime.addn(lockTime);

    expectEvent(request, 'UnstakeRequested', {
      contractAddress: firstContract,
      staker: memberOne,
      amount: ether('2'),
      unstakeAt: expectedDeallocateTime,
    });
  });

  it('should allow multiple sequential unstake requests', async function () {
    const { staking, token } = this;

    const lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    await setMinUnstake(staking, ether('2'));

    await fundApproveStake(token, staking, ether('1000'), [firstContract], [ether('1000')], memberOne);
    await fundApproveStake(token, staking, ether('2000'), [secondContract], [ether('2000')], memberTwo);

    for (let i = 0; i < 80; i += 2) {
      await staking.createUnstakeRequest([firstContract], [ether('3')], i, { from: memberOne });
      await time.increase(3600);
      await staking.createUnstakeRequest([secondContract], [ether('5')], i + 1, { from: memberTwo });
      await time.increase(3600);
    }
  });

  it('should allow multiple unstake requests after some were processed', async function () {
    const { staking, token } = this;

    const lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    await setMinUnstake(staking, ether('2'));

    await fundApproveStake(token, staking, ether('1000'), [firstContract], [ether('1000')], memberOne);

    for (let i = 0; i < 20; i++) {
      await staking.createUnstakeRequest([firstContract], [ether('3')], i, { from: memberOne });
      await time.increase(3600);
    }

    await time.increase(60 * 24 * 3600);
    await staking.processPendingActions();

    for (let i = 20; i < 60; i++) {
      const insertAfter = i === 20 ? 0 : i;
      await staking.createUnstakeRequest([firstContract], [ether('3')], insertAfter, { from: memberOne });
      await time.increase(3600);
    }
  });

  it('should allow multiple sequential unstake requests in between stakes', async function () {
    const { staking, token } = this;

    const lockTime = 30 * 24 * 3600; // 30 days
    await setUnstakeLockTime(staking, lockTime);

    await setMinUnstake(staking, ether('2'));

    await fundApproveStake(token, staking, ether('1000'), [firstContract], [ether('1000')], memberOne);

    for (let i = 0; i < 10; i++) {
      await staking.createUnstakeRequest([firstContract], [ether('10')], i, { from: memberOne });
      await time.increase(3600);
    }

    await fundApproveStake(token, staking, ether('200'), [firstContract], [ether('1200')], memberOne);

    for (let i = 10; i < 20; i++) {
      await staking.createUnstakeRequest([firstContract], [ether('8')], i, { from: memberOne });
      await time.increase(3600);
    }
  });
});
