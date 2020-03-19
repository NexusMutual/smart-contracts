const { expectRevert, ether } = require('@openzeppelin/test-helpers');
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
const thirdContract = '0x0000000000000000000000000000000000000003';

async function stake (token, staking, stakes, maxLeverage) {

  const value = maxLeverage || 1000 * 100;

  await staking.updateParameter(
    ParamType.MAX_LEVERAGE, value, { from: governanceContract },
  );

  for (const { member, amount } of stakes) {
    await token.transfer(member, amount); // fund account
    await token.approve(staking.address, amount, { from: member });
    await staking.stake(amount, { from: member });
  }
}

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

    const { staking, token } = this;

    await token.transfer(member, ether('7')); // fund account
    await token.approve(staking.address, ether('7'), { from: member });
    await staking.stake(ether('7'), { from: member });

    await expectRevert(
      staking.setAllocations([], [1], { from: member }),
      'Contracts and allocations arrays should have the same length',
    );
  });

  it('should revert when allocating to fewer contracts', async function () {

    const { staking, token } = this;

    await stake(token, staking, [{ member, amount: ether('7') }]);
    await staking.setAllocations([firstContract, secondContract], [1, 1], { from: member });

    await expectRevert(
      staking.setAllocations([firstContract], [1], { from: member }),
      'Allocating to fewer contracts is not allowed',
    );
  });

  it('should revert when contracts order has been changed', async function () {

    const { staking, token } = this;

    await stake(token, staking, [{ member, amount: ether('7') }]);
    await staking.setAllocations([firstContract, secondContract], [1, 1], { from: member });

    await expectRevert(
      staking.setAllocations([secondContract, firstContract], [1, 1], { from: member }),
      'Unexpected contract',
    );
  });

  it('should prevent allocating less than MIN_STAKE_PERCENTAGE', async function () {

    const { staking, token } = this;
    const minStakePercentage = 10 * 100; // 10% + 2 decimals

    await staking.updateParameter(
      ParamType.MIN_STAKE_PERCENTAGE, minStakePercentage, { from: governanceContract },
    );

    await stake(token, staking, [{ member, amount: ether('7') }]);

    await expectRevert(
      staking.setAllocations([firstContract], [5], { from: member }),
      'Allocation minimum not met',
    );
  });

  it('should prevent allocating more than 100% on a contract', async function () {

    const { staking, token } = this;
    const moreThan100 = 120 * 100; // 120%

    await stake(token, staking, [{ member, amount: ether('7') }]);

    await expectRevert(
      staking.setAllocations([secondContract, firstContract], [10, moreThan100], { from: member }),
      'Cannot allocate more than 100% per contract',
    );
  });

  it('should revert when sum of allocations exceeds MAX_LEVERAGE', async function () {

    const { staking, token } = this;
    const maxLeverage = 150 * 100;
    const allocation = 80 * 100; // 80%
    const contracts = [firstContract, secondContract];
    const allocations = [allocation, allocation]; // 2 * 80% each = 160%

    await stake(token, staking, [{ member, amount: ether('7') }], maxLeverage);

    await expectRevert(
      staking.setAllocations(contracts, allocations, { from: member }),
      'Total allocation exceeds maximum allowed',
    );
  });

  it('should revert when stake is zero', async function () {

    const { staking } = this;
    const contracts = [firstContract, secondContract];
    const allocations = [80 * 100, 80 * 100]; // 80% each

    await expectRevert(
      staking.setAllocations(contracts, allocations, { from: member }),
      'Allocations can be set only when staked amount is non-zero',
    );
  });

  it('should properly set staker contracts and their allocations', async function () {

    const { staking, token } = this;
    const contracts = [firstContract, secondContract];
    const allocations = [40, 70].map(i => i * 100);

    await stake(token, staking, [{ member, amount: ether('7') }]);
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

    const { staking, token } = this;
    const contracts = [firstContract, secondContract];
    const allocations = [40, 70].map(i => i * 100);
    const increasedAllocations = [50, 80].map(i => i * 100);

    await stake(token, staking, [{ member, amount: ether('7') }]);
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

  it('should add staker to contract stakers array', async function () {

    const { staking, token } = this;
    await stake(token, staking, [{ member, amount: ether('7') }]);

    // first allocation
    await staking.setAllocations([firstContract], [50 * 100], { from: member });

    const count = await staking.contractStakerCount(firstContract);
    const staker = await staking.contractStakerAtIndex(firstContract, 0);
    assert(count.eqn(1), `staker count for ${firstContract} should be 1`);
    assert(staker === member, `staker at index 0 should match member address`);

    // second allocation
    const contracts = [firstContract, secondContract, thirdContract];
    const allocations = [50, 40, 70].map(i => i * 100);
    await staking.setAllocations(contracts, allocations, { from: member });

    const counts = await Promise.all([
      staking.contractStakerCount(firstContract),
      staking.contractStakerCount(secondContract),
      staking.contractStakerCount(thirdContract),
    ]);

    for (const count of counts) {
      assert(count.eqn(1), `staker count should be 1, got ${count}`);
    }

    const stakers = await Promise.all([
      staking.contractStakerAtIndex(firstContract, 0),
      staking.contractStakerAtIndex(secondContract, 0),
      staking.contractStakerAtIndex(thirdContract, 0),
    ]);

    for (const staker of stakers) {
      assert(staker === member, `staker at index 0 should be ${member}`);
    }
  });

  it('should correctly update staked amounts on allocation increase', async function () {

    const { staking, token } = this;
    await stake(token, staking, [{ member, amount: ether('7') }]);

    const contracts = [firstContract, secondContract];
    const expectedAmounts = [
      {
        allocations: [25, 70].map(i => i * 100),
        [firstContract]: ether('7').muln(2500).divn(10000),
        [secondContract]: ether('7').muln(7000).divn(10000),
      },
      {
        allocations: [2712, 7512],
        [firstContract]: ether('7').muln(2712).divn(10000),
        [secondContract]: ether('7').muln(7512).divn(10000),
      },
    ];

    for (const round of expectedAmounts) {

      const { allocations } = round;
      await staking.setAllocations(contracts, allocations, { from: member });

      for (const contract of contracts) {
        const actualAmount = await staking.contracts(contract);
        const expectedAmount = round[contract];
        assert(
          actualAmount.eq(expectedAmount),
          `${contract} should have ${expectedAmount.toString()} staked`,
        );
      }
    }

  });

});
