const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [member],
  // advisoryBoardMembers: [advisoryBoardMember],
  // internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';

describe('setAllocations', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.setAllocations([], [], { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert when allocations and contracts arrays lengths differ', async function () {

    const { staking } = this;

    await expectRevert(
      staking.setAllocations([], [1], { from: member }),
      'Contracts and allocations arrays should have the same length',
    );
  });

  it('should revert when allocating to fewer contracts', async function () {

    const { staking } = this;
    const maxLeverage = 1000 * 100;

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    await staking.setAllocations([firstContract, secondContract], [1, 1], { from: member });

    await expectRevert(
      staking.setAllocations([firstContract], [1], { from: member }),
      'Allocating to fewer contracts is not allowed',
    );
  });

  it('should revert when contracts order has been changed', async function () {

    const { staking } = this;
    const maxLeverage = 1000 * 100;

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    await staking.setAllocations([firstContract, secondContract], [1, 1], { from: member });

    await expectRevert(
      staking.setAllocations([secondContract, firstContract], [1, 1], { from: member }),
      'Unexpected contract',
    );
  });

  it('should prevent allocating less than MIN_STAKE_PERCENTAGE', async function () {

    const { staking } = this;
    const minStakePercentage = 10 * 100; // 10% + 2 decimals
    const maxLeverage = 1000 * 100;

    await staking.updateParameter(
      ParamType.MIN_STAKE_PERCENTAGE, minStakePercentage, { from: governanceContract },
    );

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    await expectRevert(
      staking.setAllocations([firstContract], [5], { from: member }),
      'Allocation minimum not met',
    );
  });

  it('should prevent allocating more than 100% on a contract', async function () {

    const { staking } = this;
    const moreThan100 = 120 * 100; // 120%

    await expectRevert(
      staking.setAllocations([secondContract, firstContract], [10, moreThan100], { from: member }),
      'Cannot allocate more than 100% per contract',
    );
  });

  it('should revert when sum of allocations exceeds MAX_LEVERAGE', async function () {

    const { staking } = this;
    const maxLeverage = 150 * 100; // 150%
    const allocation = 80 * 100; // 80%

    const contracts = [...Array(2)].map((x, i) => '0x' + `${i}`.padStart(40, '0')); // 2 contracts
    const allocations = Array(2).fill(allocation); // 2 * 80% each = 160%

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    await expectRevert(
      staking.setAllocations(contracts, allocations, { from: member }),
      'Total allocation exceeds maximum allowed',
    );
  });

  it('should properly set staker contracts and their allocations', async function () {

    const { staking } = this;
    const maxLeverage = 1000 * 100; // 1000%

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    const contracts = [firstContract, secondContract];
    const allocations = [40, 70].map(i => i * 100);

    await staking.setAllocations(contracts, allocations, { from: member });

    const length = await staking.stakerContractCount(member);
    const foundContracts = [];
    const foundAllocations = [];

    for (let i = 0; i < length; i++) {
      const contract = await staking.stakerContractAtIndex(member, i);
      const allocation = await staking.stakerContractAllocation(member, contract);
      foundContracts.push(contract);
      foundAllocations.push(allocation.toNumber());
    }

    assert.deepEqual(
      contracts, foundContracts,
      'found contracts should be identical to allocated contracts',
    );

    assert.deepEqual(
      allocations, foundAllocations,
      'found allocations should be identical to allocated allocations',
    );
  });

  it('should allow allocation increase', async function () {

    const { staking } = this;
    const maxLeverage = 1000 * 100; // 1000%

    await staking.updateParameter(
      ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract },
    );

    const contracts = [firstContract, secondContract];
    const allocations = [40, 70].map(i => i * 100);
    const increasedAllocations = [50, 80].map(i => i * 100);

    await staking.setAllocations(contracts, allocations, { from: member });
    await staking.setAllocations(contracts, increasedAllocations, { from: member });

    const length = await staking.stakerContractCount(member);
    const foundContracts = [];
    const foundAllocations = [];

    for (let i = 0; i < length; i++) {
      const contract = await staking.stakerContractAtIndex(member, i);
      const allocation = await staking.stakerContractAllocation(member, contract);
      foundContracts.push(contract);
      foundAllocations.push(allocation.toNumber());
    }

    assert.deepEqual(
      contracts, foundContracts,
      'found contracts should be identical to allocated contracts',
    );

    assert.deepEqual(
      increasedAllocations, foundAllocations,
      'found allocations should be identical to allocated allocations',
    );
  });

});
