const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType } = require('../utils').constants;
const setup = require('../setup');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndApprove (token, staking, amount, member) {
  const maxLeverage = '2';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe('stake', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.stake(ether('1'), [firstContract], [1], { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert when allocating to fewer contracts than already allocated', async function () {

    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne);
    // first stake
    await staking.stake(amount, [firstContract, secondContract], [1, 1], { from: memberOne });

    // second stake, allocating to incomplete list of contracts
    await expectRevert(
      staking.stake(amount, [thirdContract], [1], { from: memberOne }),
      'Allocating to fewer contracts is not allowed',
    );
  });

  it('should revert when contracts and allocations arrays lengths differ', async function () {

    const { staking } = this;

    await expectRevert(
      staking.stake(ether('7'), [firstContract, secondContract], [1], { from: memberOne }),
      'Contracts and allocations arrays should have the same length',
    );
  });

  it('should prevent allocating < MIN_ALLOCATION', async function () {

    const { staking, token } = this;
    const minStake = ether('20');
    const amount = ether('1');

    await staking.updateParameter(ParamType.MIN_ALLOCATION, minStake, { from: governanceContract });
    await fundAndApprove(token, staking, amount, memberOne);

    await expectRevert(
      staking.stake(amount, [firstContract], [ether('10')], { from: memberOne }),
      'Allocation minimum not met',
    );
  });

  it('should prevent allocating > total staked on any one contract', async function () {

    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne);

    await expectRevert(
      staking.stake(amount, [firstContract], [ether('2')], { from: memberOne }),
      'Cannot allocate more than staked',
    );
  });

  it('should revert when contracts order has been changed', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('10');
    const totalAmount = ether('20');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.stake(stakeAmount, [firstContract, secondContract], [stakeAmount, stakeAmount], { from: memberOne });

    // second stake, with contracts passed in the wrong order
    await expectRevert(
      staking.stake(stakeAmount, [secondContract, firstContract], [stakeAmount, stakeAmount], { from: memberOne }),
      'Unexpected contract order',
    );
  });

  it('should revert when new allocation is less than previous one', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('10');
    const totalAmount = ether('20');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.stake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // second stake, with a smaller allocation than the existing one
    await expectRevert(
      staking.stake(stakeAmount, [firstContract], [ether('7')], { from: memberOne }),
      'New allocation is less than previous allocation',
    );
  });

  it('should revert when total allocation exceeds maximum allowed (based on leverage)', async function () {
    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne); // MAX_LEVERAGE = 2

    // Allocate 3x the staked amount, when MAX_LEVERAGE = 2
    await expectRevert(
      staking.stake(
        amount,
        [firstContract, secondContract, thirdContract],
        [amount, amount, amount],
        { from: memberOne },
      ),
      'Total allocation exceeds maximum allowed',
    );
  });

  it('should revert when staking without allowance', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('1');

    // fund from default account
    await token.transfer(memberOne, stakeAmount);

    await expectRevert(
      staking.stake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne }),
      'ERC20: transfer amount exceeds allowance.',
    );
  });

  it('should update the total staked amount of the staker', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    await fundAndApprove(token, staking, totalAmount, memberOne);

    // stake 1 nxm
    await staking.stake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // check first stake
    const { staked: firstAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(firstAmount.eq(stakeAmount), 'amount should be equal to staked amount');

    // stake 1 nxm
    await staking.stake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // check final stake
    const { staked: finalAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(finalAmount.eq(totalAmount), 'final amount should be equal to total staked amount');
  });

  it('should allow 0 stake amount', async function () {
    const { staking, token } = this;

    const amount = ether('10');
    const contracts = [firstContract, secondContract];
    const allocations = [ether('5'), ether('5')];

    await fundAndApprove(token, staking, amount, memberOne);
    // First stake
    await staking.stake(amount, contracts, allocations, { from: memberOne });

    // Allocate more on the contracts they already staked one, without increasing the stake amount
    await staking.stake(0, contracts, [ether('6'), ether('6')], { from: memberOne });
    const { staked: sameStake } = await staking.stakers(memberOne, { from: memberOne });
    assert(sameStake.eq(amount), 'amount staked should be the same');

    // Allocate to one more contract, without increasing the stake amount
    await staking.stake(
      0,
      [firstContract, secondContract, thirdContract],
      [ether('6'), ether('6'), ether('2')],
      { from: memberOne },
    );
    const { staked: sameStakeAgain } = await staking.stakers(memberOne, { from: memberOne });
    assert(sameStakeAgain.eq(amount), 'amount staked should be the same');
  });

  it('should move tokens from the caller to the PooledStaking contract', async function () {

    const { staking, token } = this;
    let expectedBalance = ether('0');

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakes = [
      { amount: ether('1'), contracts: [firstContract], allocations: [ether('1')], from: memberOne },
      { amount: ether('2'), contracts: [firstContract, secondContract], allocations: [ether('1'), ether('2')], from: memberOne },
      { amount: ether('3'), contracts: [firstContract], allocations: [ether('3')], from: memberTwo },
      { amount: ether('4'), contracts: [firstContract, secondContract], allocations: [ether('3'), ether('4')], from: memberTwo },
    ];

    for (const stake of stakes) {
      const { amount, contracts, allocations, from } = stake;

      await staking.stake(amount, contracts, allocations, { from });

      expectedBalance = expectedBalance.add(amount);
      const currentBalance = await token.balanceOf(staking.address);

      assert(
        currentBalance.eq(expectedBalance),
        `staking contract balance should be ${expectedBalance.toString()}`,
      );
    }

    const memberOneBalance = await token.balanceOf(memberOne);
    const memberTwoBalance = await token.balanceOf(memberTwo);

    const memberOneExpectedBalance = ether('10').sub(ether('1')).sub(ether('2'));
    const memberTwoExpectedBalance = ether('10').sub(ether('3')).sub(ether('4'));

    assert(memberOneBalance.eq(memberOneExpectedBalance), 'memberOne balance should be decreased accordingly');
    assert(memberTwoBalance.eq(memberTwoExpectedBalance), 'memberTwo balance should be decreased accordingly');
  });

  it('should update the total staked amount for each contract given as input', async function () {
    const { staking, token } = this;

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakes = [
      { amount: ether('1'), contracts: [firstContract], allocations: [ether('1')], from: memberOne },
      {
        amount: ether('2'),
        contracts: [firstContract, secondContract],
        allocations: [ether('1'), ether('2')],
        from: memberOne,
      },
      { amount: ether('3'), contracts: [firstContract], allocations: [ether('3')], from: memberTwo },
      {
        amount: ether('4'),
        contracts: [firstContract, secondContract],
        allocations: [ether('3'), ether('4')],
        from: memberTwo,
      },
    ];

    const allExpectedAmounts = [
      { [firstContract]: ether('1'), [secondContract]: ether('0') },
      { [firstContract]: ether('1'), [secondContract]: ether('2') },
      { [firstContract]: ether('4'), [secondContract]: ether('2') },
      { [firstContract]: ether('4'), [secondContract]: ether('6') },
    ];

    for (let i = 0; i < stakes.length; i++) {
      const { amount, contracts, allocations, from } = stakes[i];
      const expectedAmounts = allExpectedAmounts[i];

      await staking.stake(amount, contracts, allocations, { from });

      for (const contract of Object.keys(expectedAmounts)) {
        const { staked: actualAmount } = await staking.contracts(contract);
        const expectedAmount = expectedAmounts[contract];

        assert(
          actualAmount.eq(expectedAmount),
          `staked amount for ${contract} expected to be ${expectedAmount.toString()}, got ${actualAmount.toString()}`,
        );
      }
    }
  });

  it('should update the staker allocation for each contract given as input', async function () {

    const { staking, token } = this;

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakes = [
      { amount: ether('1'), contracts: [firstContract], allocations: [ether('1')], from: memberOne },
      {
        amount: ether('2'),
        contracts: [firstContract, secondContract],
        allocations: [ether('1'), ether('2')],
        from: memberOne,
      },
      { amount: ether('3'), contracts: [firstContract], allocations: [ether('3')], from: memberTwo },
      {
        amount: ether('4'),
        contracts: [firstContract, secondContract],
        allocations: [ether('3'), ether('4')],
        from: memberTwo,
      },
    ];

    const allExpectedAmounts = [
      { [firstContract]: ether('1'), [secondContract]: ether('0') },
      { [firstContract]: ether('1'), [secondContract]: ether('2') },
      { [firstContract]: ether('3'), [secondContract]: ether('0') },
      { [firstContract]: ether('3'), [secondContract]: ether('4') },
    ];

    for (let i = 0; i < stakes.length; i++) {
      const { amount, contracts, allocations, from } = stakes[i];
      const expectedAmounts = allExpectedAmounts[i];

      await staking.stake(amount, contracts, allocations, { from });

      for (const contract of Object.keys(expectedAmounts)) {
        const actualAllocation = await staking.stakerContractAllocation(from, contract);
        const expectedAllocation = expectedAmounts[contract];

        assert(
          actualAllocation.eq(expectedAllocation),
          `staked amount for ${contract} expected to be ${expectedAllocation}, got ${actualAllocation}`,
        );
      }
    }
  });

  it('should push new contracts to staker\`s contracts and contract\'s stakers', async function () {
    const { staking, token } = this;

    const amount = ether('10');
    const contracts = [firstContract, secondContract];
    const allocations = [ether('5'), ether('5')];

    await fundAndApprove(token, staking, amount, memberOne);

    // Stake and allocate on 2 contracts
    await staking.stake(amount, contracts, allocations, { from: memberOne });

    const length = await staking.stakerContractCount(memberOne);
    const actualContracts = [];
    const actualAllocations = [];

    for (let i = 0; i < length; i++) {
      const contract = await staking.stakerContractAtIndex(memberOne, i);
      const allocation = await staking.stakerContractAllocation(memberOne, contract);
      actualContracts.push(contract);
      actualAllocations.push(allocation);
    }

    assert.deepEqual(
      allocations.map(alloc => alloc.toString()),
      actualAllocations.map(alloc => alloc.toString()),
      `found allocations ${actualAllocations} should be identical to actual allocations ${allocations}`,
    );

    assert.deepEqual(
      contracts, actualContracts,
      'found contracts should be identical to actual contracts',
    );

    const newContracts = [firstContract, secondContract, thirdContract];
    const newAllocations = [ether('5'), ether('5'), ether('6')];

    // Allocate on 3 contracts
    await staking.stake(0, newContracts, newAllocations, { from: memberOne });

    const newLength = await staking.stakerContractCount(memberOne);
    const newActualContracts = [];
    const newActualAllocations = [];

    for (let i = 0; i < newLength; i++) {
      const contract = await staking.stakerContractAtIndex(memberOne, i);
      const allocation = await staking.stakerContractAllocation(memberOne, contract);
      newActualContracts.push(contract);
      newActualAllocations.push(allocation);
    }

    assert.deepEqual(
      newAllocations.map(alloc => alloc.toString()),
      newActualAllocations.map(alloc => alloc.toString()),
      `found new allocations ${newActualAllocations} should be identical to new actual allocations ${newAllocations}`,
    );

    assert.deepEqual(
      newContracts, newActualContracts,
      'found new contracts should be identical to new actual contracts',
    );
  });

});
