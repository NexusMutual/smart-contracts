const { expectRevert, ether, time } = require('@openzeppelin/test-helpers');

const { assert } = require('chai');

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

async function fundApproveStake (token, staking, amount, contracts, allocations, member) {
  const maxLeverage = '10';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

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
    const lockTime = 90 * 24 * 3600; // 90 days

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, ether('2'), { from: governanceContract });
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // index does not exist
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 5, { from: memberOne }),
      'Invalid deallocation id provided.',
    );

    // insert first
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
    await staking.processPendingActions();

    // insert second
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });
    await staking.processPendingActions();

    // index does not exist
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 3, { from: memberOne }),
      'Invalid deallocation id provided.',
    );
  });

  it('should revert when there\'s nothing to deallocate on a contract', async function () {

    const { staking } = this;

    await expectRevert(
      staking.requestDeallocation([firstContract], [1], 0, { from: memberOne }),
      'Nothing to deallocate on this contract',
    );

  });

  it('should revert when deallocating more than allocated', async function () {

    const { staking, token } = this;
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('11')], 0, { from: memberOne }),
      'Cannot deallocate more than allocated',
    );

    await staking.requestDeallocation([firstContract], [ether('10')], 0, { from: memberOne });
  });

  it('should revert when requested deallocation is less than MIN_ALLOWED_DEALLOCATION', async function () {

    const { staking, token } = this;
    const minAllowedDeallocation = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, minAllowedDeallocation, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('1')], 0, { from: memberOne }),
      'Deallocation cannot be less then MIN_ALLOWED_DEALLOCATION',
    );

    await staking.requestDeallocation([firstContract], [minAllowedDeallocation], 0, { from: memberOne });
  });

  it('should process if requested deallocation is greater than MIN_ALLOWED_DEALLOCATION', async function () {

    const { staking, token } = this;
    const minAllowedDeallocation = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, minAllowedDeallocation, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await staking.requestDeallocation([firstContract], [ether('3')], 0, { from: memberOne });
  });

  it('should process if requested deallocation is equal to MIN_ALLOWED_DEALLOCATION', async function () {

    const { staking, token } = this;
    const minAllowedDeallocation = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, minAllowedDeallocation, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await staking.requestDeallocation([firstContract], [minAllowedDeallocation], 0, { from: memberOne });
  });

  it('should revert when final allocation is less than MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minAllocation = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minAllocation, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('9')], 0, { from: memberOne }),
      'Final allocation cannot be less then MIN_ALLOCATION',
    );
  });

  it('should process if final allocation is equal to MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minAllocation = ether('2');
    const allocation = ether('10');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minAllocation, { from: governanceContract });
    await fundApproveStake(token, staking, allocation, [firstContract], [allocation], memberOne);

    await staking.requestDeallocation([firstContract], [allocation.sub(minAllocation)], 0, { from: memberOne });
  });

  it('should process if final allocation is greater than MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minAllocation = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minAllocation, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await staking.requestDeallocation([firstContract], [ether('8')], 0, { from: memberOne });
  });

  it('should revert if deallocation time is less than previous deallocation time', async function () {

    const { staking, token } = this;
    const lockTime = 90 * 24 * 3600; // 90 days

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, ether('2'), { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    // DEALLOCATE_LOCK_TIME = 90
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });
    // First deallocation
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });

    // DEALLOCATE_LOCK_TIME = 30
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime / 3, { from: governanceContract });
    // Second deallocation
    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne }),
      'Deallocation time must be greater or equal to previous deallocation',
    );
  });

  it('should revert if deallocation time is greater than next deallocation time', async function () {

    const { staking, token } = this;
    const lockTime = 90 * 24 * 3600; // 90 days

    await staking.updateParameter(ParamType.MIN_ALLOWED_DEALLOCATION, ether('2'), { from: governanceContract });
    await fundApproveStake(token, staking, ether('20'), [firstContract], [ether('20')], memberOne);

    // DEALLOCATE_LOCK_TIME = 30 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime / 3, { from: governanceContract });

    // Send a few deallocation requests
    await staking.requestDeallocation([firstContract], [ether('2')], 0, { from: memberOne });
    await staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne });
    await staking.requestDeallocation([firstContract], [ether('2')], 2, { from: memberOne });

    // DEALLOCATE_LOCK_TIME = 90 days
    await staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('2')], 1, { from: memberOne }),
      'Deallocation time must be smaller than next deallocation',
    );
  });

});
