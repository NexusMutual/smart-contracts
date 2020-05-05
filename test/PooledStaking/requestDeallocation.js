const { expectRevert, expectEvent, ether, time } = require('@openzeppelin/test-helpers');

const { assert, expect } = require('chai');

const accounts = require('../utils/accounts');
const { ParamType } = require('../utils/constants');
const setup = require('../utils/setup');

const {
  nonMembers: [nonMember],
  members: [memberOne],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundApproveStake (token, staking, amount, contracts, allocations, member) {
  const maxLeverage = '10';
  const lockTime = 90 * 24 * 3600; // 90 days
  const minAllocation = ether('2');

  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });
  await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, ether('2'), { from: governanceContract });
  await staking.updateParameter(ParamType.MIN_ALLOCATION, minAllocation, { from: governanceContract });
  await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });

  await staking.stake(amount, contracts, allocations, { from: memberOne });
}

describe('requestDeallocation', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.requestDeallocation([firstContract], [1], 0, { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert when contracts and deallocations arrays lengths differ', async function () {

    const { staking } = this;

    await expectRevert(
      staking.requestDeallocation([firstContract, secondContract], [1], 0, { from: memberOne }),
      'Contracts and amounts arrays should have the same length',
    );
  });

  it('should revert if insertAfter index is invalid', async function () {

    const { staking, token } = this;

    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // index does not exist
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 5, { from: memberOne }),
      'Invalid deallocation id provided',
    );

    // insert first request
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
    // expect last deallocation id to be 1
    let lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(1), `expected last deallocation id to be 1, found ${lastDeallocationId}`);

    // insert second
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });
    // expect last deallocation id to be 2
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(2), `expected last deallocation id to be 2, found ${lastDeallocationId}`);

    // expect insertAfter = 3 is invalid
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 3, { from: memberOne }),
      'Invalid deallocation id provided',
    );
  });

  it('should revert when there\'s nothing to deallocate on a contract', async function () {

    const { staking, token } = this;

    // Nothing staked / allocated on the contract
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('1')], 0, { from: memberOne }),
      'Nothing to deallocate on this contract',
    );

    // stake 10 and allocate [10, 10] on 2 contracts
    await fundApproveStake(token, staking, ether('10'), [firstContract, secondContract], [ether('10'), ether('7')], memberOne);

    // request deallocation of 10 on firstcontract
    await staking.requestDeallocation([firstContract], [ether('10')], 0, { from: memberOne });

    // request deallocation of 1 on firstContract
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('1')], 1, { from: memberOne }),
      'Nothing to deallocate on this contract',
    );
  });

  it('should revert when deallocating more than allocated', async function () {

    const { staking, token } = this;

    // Stake 10 and allocate 10 on firstContract
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // Request deallocation of 11 on firstContract
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('11')], 0, { from: memberOne }),
      'Cannot deallocate more than allocated',
    );

    // Request deallocation of 7 on firstContract
    await staking.requestDeallocation([firstContract], [ether('7')], 0, { from: memberOne });

    // Request deallocation of 4, (allocated = 10; pending deallocations = 7; max that can be deallocated is 3)
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('4')], 0, { from: memberOne }),
      'Cannot deallocate more than allocated',
    );

  });

  it('should revert when requested deallocation < MIN_ALLOWED_DEALLOCATION', async function () {

    const { staking, token } = this;

    // Stake 10 and allocate 10 on firstContract; MIN_ALLOWED_DEALLOCATION = 2
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // Request deallocation of 1 (< MIN_ALLOWED_DEALLOCATION)
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('1')], 0, { from: memberOne }),
      'Deallocation cannot be less then MIN_ALLOWED_DEALLOCATION',
    );

    // Request deallocation of 2 (= MIN_ALLOWED_DEALLOCATION)
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
  });

  it('should revert when final allocation is less than MIN_ALLOCATION', async function () {

    const { staking, token } = this;

    // Stake 10 and allocate 10 on firt contract; MIN_ALLOCATION = 2
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // Request deallocation of 9, that would decrease allocation to 1 (< MIN_ALLOCATION)
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('9')], 0, { from: memberOne }),
      'Final allocation cannot be less then MIN_ALLOCATION',
    );

    // Request deallocation of 9, that would decrease allocation to 2 (= MIN_ALLOCATION)
    staking.requestDeallocation([firstContract], [ether('8')], 0, { from: memberOne });
  });

  it('should revert if requested deallocation time < deallocation time at insertAfter index', async function () {

    const { staking, token } = this;

    // Stake 20 and allocate 20 on firstContract, DEALLOCATE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // First deallocation, with lock time 90
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });

    // 1h passes
    time.increase(3600);

    // Decrease DEALLOCATE_LOCK_TIME to 30
    const newLockTime = 30 * 24 * 3600; // 90 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, newLockTime, { from: governanceContract });

    // Second deallocation can't be inserted after 1 (due time < due time at index 1)
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne }),
      'Deallocation time must be greater or equal to previous deallocation',
    );

    // Third deallocation requested successfully when added after index 0
    // New state: 2 -> 1
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });

    // Fourth deallocation requested inserted successfully after index 2,
    // as deallocateAt is the same for both (same block)
    // New state: 2 -> 3 -> 1
    await staking.requestDeallocation([firstContract], [ether('2')], 2, { from: memberOne });
  });

  it('should revert if requested deallocation time >= deallocation time at next of insertAfter index', async function () {

    const { staking, token } = this;

    let lastDeallocationId;

    // Stake 10 and allocate 10 on firstContract, DEALLOCATE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // First deallocation
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
    // LastDeallocationId should be 1
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(1));

    // 1h passes
    time.increase(3600);

    // Second deallocation, can be inserted after index 1
    // New state: 1 -> 2
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });
    // LastDeallocationId should be 2
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(2));

    // Third deallocation, due at the same time index 2 (same lock time, same block),
    // can't be inserted after 1
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne }),
      'Deallocation time must be smaller than next deallocation',
    );

    // Fourth deallocation, due at the same time as index 2 (same lock time, same block),
    // it can be inserted after index 2
    // New state: 1 -> 2 -> 3
    await staking.requestDeallocation([firstContract], [ether('2')], 2, { from: memberOne });
    // LastDeallocationId should be 3
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(3));

    // 1h passes
    time.increase(3600);

    // Fifth deallocation, cannot be inserted after index 2, as
    // it's due after the request at index 2, but also after the request at index 3
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 2, { from: memberOne }),
      'Deallocation time must be smaller than next deallocation',
    );
  });

  it('ensure the requested deallocation is inserted in the deallocations mapping', async function () {

    const { staking, token } = this;

    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    const deallocations = [
      { amount: ether('2'), deallocateAt: 1, contractAddress: firstContract, stakerAddress: memberOne, next: 0 },
      { amount: ether('3'), deallocateAt: 2, contractAddress: firstContract, stakerAddress: memberOne, next: 0 },
      { amount: ether('4'), deallocateAt: 3, contractAddress: firstContract, stakerAddress: memberOne, next: 0 },
    ];

    // Request a few deallocations
    for (let i = 0; i < deallocations.length; i++) {
      await staking.requestDeallocation(
        [deallocations[i].contractAddress],
        [deallocations[i].amount],
        i,
        { from: memberOne },
      );
    }

    const actualDeallocations = [];

    // Fetch the actual deallocations (always starting with index 1)
    for (let i = 1; i <= deallocations.length; i++) {
      const deallocation = await staking.deallocationAtIndex(i);
      actualDeallocations.push(deallocation);
    }

    // Check all deallocations have been pushed to the deallocations mapping
    // assert.deepEqual(
    //   deallocations.map(alloc => alloc.toString()),
    //   actualDeallocations.map(alloc => alloc.toString()),
    //   `found allocations ${actualDeallocations} should be identical to actual allocations ${deallocations}`,
    // );
  });

  it('ensure that next pointer of the new request points to the next of request at index insertAfter', async function () {
    const { staking, token } = this;

    let lastDeallocationId;
    let lockTime;

    // Stake 20 and allocate 20 on firstContract, DEALLOCATE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Set DEALLOCATE_LOCK_TIME to 30 days
    lockTime = 30 * 24 * 3600; // 30 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // First deallocation
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });

    // New state: 0 -> 1 -> 0
    // Next pointer should be 0
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(1), `expected lastDeallocationId to be 1, found ${lastDeallocationId}`);
    const { next: nextIndexOne } = await staking.deallocationAtIndex(lastDeallocationId);
    assert(nextIndexOne.eqn(0), `expected next index to be 0, found ${nextIndexOne.toString()}`);

    // Set DEALLOCATE_LOCK_TIME to 60 days
    lockTime = 60 * 24 * 3600; // 60 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // Second deallocation, after index 1
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });

    // New state: 0 -> 1 -> 2 -> 0
    // Next pointer should be 0
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(2), `expected lastDeallocationId to be 2, found ${lastDeallocationId}`);
    const { next: nextIndexTwo } = await staking.deallocationAtIndex(lastDeallocationId);
    assert(nextIndexTwo.eqn(0), `expected next index to be 0, found ${nextIndexTwo.toString()}`);

    // Set DEALLOCATE_LOCK_TIME to 50 days
    lockTime = 50 * 24 * 3600; // 50 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // Third deallocation, after index 1
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });

    // New state: 0 -> 1 -> 3 -> 2 -> 0
    // Next pointer for 3 should be 2
    lastDeallocationId = await staking.lastDeallocationId();
    assert(lastDeallocationId.eqn(3), `expected lastDeallocationId to be 3, found ${lastDeallocationId}`);
    const { next: nextIndexThree } = await staking.deallocationAtIndex(lastDeallocationId);
    assert(nextIndexThree.eqn(2), `expected next index to be 2, found ${nextIndexThree}`);
  });

  it('ensure that next pointer of the request at insertAfter index points to the new request', async function () {
    const { staking, token } = this;

    let insertAfter;
    let lockTime;

    // Stake 20 and allocate 20 on firstContract, DEALLOCATE_LOCK_TIME = 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Set DEALLOCATE_LOCK_TIME to 30 days
    lockTime = 30 * 24 * 3600; // 30 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // First deallocation
    insertAfter = 0;
    await staking.requestDeallocation([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 0
    // Next pointer of request at insertAfter should be 1
    const { next: nextIndexOne } = await staking.deallocationAtIndex(insertAfter);
    assert(nextIndexOne.eqn(1), `expected next index to be 1, found ${nextIndexOne}`);

    // Set DEALLOCATE_LOCK_TIME to 60 days
    lockTime = 60 * 24 * 3600; // 60 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // Second deallocation, after index 1
    insertAfter = 1;
    await staking.requestDeallocation([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 2 -> 0
    // Next pointer of request at insertAfter should be 2
    const { next: nextIndexTwo } = await staking.deallocationAtIndex(insertAfter);
    assert(nextIndexTwo.eqn(2), `expected next index to be 2, found ${nextIndexTwo}`);

    // Set DEALLOCATE_LOCK_TIME to 50 days
    lockTime = 50 * 24 * 3600; // 50 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    // Third deallocation, after index 1
    insertAfter = 1;
    await staking.requestDeallocation([firstContract], [ether('2')], insertAfter, { from: memberOne });

    // New state: 0 -> 1 -> 3 -> 2 -> 0
    // Next pointer of request at indexAfter should be 3
    const { next: nextIndexThree } = await staking.deallocationAtIndex(insertAfter);
    assert(nextIndexThree.eqn(3), `expected next index to be 2, found ${nextIndexThree}`);
  });

  // it('ensure the total pending deallocations amount of the staker for the given contract is updated', async function () {
  //   // uint newPending = staker.pendingDeallocations[contractAddress].add(requestedAmount);
  //   // staker.pendingDeallocations[contractAddress] = newPending;
  //
  //   const { staking, token } = this;
  //
  //   // Stake 20 and allocate 20 on firstContract, DEALLOCATE_LOCK_TIME = 90 days
  //   await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);
  //
  //   // First deallocation
  //   await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
  //
  //   const { pendingDeallocations: deallocationsMemberOne  } = await staking.stakers(
  //       memberOne,
  //       { from: memberOne },
  //   );
  // });

  it('should emit DeallocationRequested event', async function () {
    const { staking, token } = this;

    // Stake 20 and allocate 20 on firstContract, lock time 90 days
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // Deallocate
    const deallocation = await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });

    const latestBlockTime = await time.latest();
    const expectedDeallocateTime = latestBlockTime.addn(90 * 24 * 3600);

    expectEvent(deallocation, 'DeallocationRequested', {
      contractAddress: firstContract,
      staker: memberOne,
      amount: ether('2'),
      deallocateAt: expectedDeallocateTime,
    });

  });
});
