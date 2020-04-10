const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const { ParamType } = require('../utils/constants');
const setup = require('../utils/setup');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree],
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

  it('should revert when there\'s nothing to deallocate on a contract', async function () {

    const { staking } = this;

    await expectRevert(
      staking.requestDeallocation([firstContract], [1], 0, { from: memberOne }),
      ' Nothing to deallocate on this contract',
    );

    // TODO: add more scenarios with some pendingDeallocations / allocations
  });

  it('should revert when deallocating more than allocated', async function () {

    const { staking, token } = this;
    const minAllowedDeallocation = ether('2');

    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('11')], 0, { from: memberOne }),
      'Cannot deallocate more than allocated',
    );

    await staking.requestDeallocation([firstContract], [minAllowedDeallocation], 0, { from: memberOne });
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
    const minStake = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minStake, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await expectRevert(
      staking.requestDeallocation([firstContract], [ether('9')], 0, { from: memberOne }),
      'Final allocation cannot be less then MIN_ALLOCATION',
    );
  });

  it('should process if final allocation is greater than MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minStake = ether('2');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minStake, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await staking.requestDeallocation([firstContract], [ether('8')], 0, { from: memberOne });
  });

  it('should process if final allocation is equal to MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minStake = ether('2');
    const totalStake = ether('10');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minStake, { from: governanceContract });
    await fundApproveStake(token, staking, ether('10'), [firstContract], [ether('10')], memberOne);

    await staking.requestDeallocation([firstContract], [totalStake.sub(minStake)], 0, { from: memberOne });
  });

});
