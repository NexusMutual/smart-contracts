const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree],
  // advisoryBoardMembers: [advisoryBoardMember],
  // internalContracts: [internalContract],
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

  it('should revert when allocating to fewer contracts', async function () {

    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne);
    // first stake
    staking.stake(amount, [firstContract, secondContract], [1, 1], { from: memberOne });

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

  it('should prevent allocating less than MIN_STAKE', async function () {

    const { staking, token } = this;
    const minStake = 20;
    const amount = ether('1');

    await staking.updateParameter(ParamType.MIN_STAKE, minStake, { from: governanceContract });
    await fundAndApprove(token, staking, amount, memberOne);

    await expectRevert(
      staking.stake(amount, [firstContract], [1], { from: memberOne }),
      'Allocation minimum not met',
    );
  });

  it('should prevent allocating more than staked on a contract', async function () {

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
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.stake(stakeAmount, [firstContract, secondContract], [1, 1], { from: memberOne });

    // second stake, with contracts passed in the wrong order
    await expectRevert(
      staking.stake(stakeAmount, [secondContract, firstContract], [1, 1], { from: memberOne }),
      'Unexpected contract order',
    );
  });

  it('should revert when new allocation is less than previous one', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.stake(stakeAmount, [firstContract], [10], { from: memberOne });

    // second stake, with a smaller allocation than the existing one
    await expectRevert(
      staking.stake(stakeAmount, [firstContract], [9], { from: memberOne }),
      'New allocation is less than previous allocation',
    );
  });

  it('should revert when total allocation exceeds maximum allowed', async function () {
    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne); // MAX_LEVERAGE = 2

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

    await token.transfer(memberOne, stakeAmount);
    // TODO: assert the token allowance is 0

    await expectRevert(
      staking.stake(stakeAmount, [firstContract], [1], { from: memberOne }),
      'ERC20: transfer amount exceeds allowance.',
    );
  });

  it('should add the staked amount to the total user stake', async function () {
    const { staking, token } = this;
    const { staked: stakedBefore } = await staking.stakers(memberOne, { from: memberOne });
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    assert(stakedBefore.eqn(0), 'initial amount should be 0');

    await fundAndApprove(token, staking, totalAmount, memberOne);

    // stake 1 nxm
    await staking.stake(stakeAmount, [firstContract], [1], { from: memberOne });

    // check first stake
    const { staked: firstAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(firstAmount.eq(stakeAmount), 'amount should be equal to staked amount');

    // stake 1 nxm
    await staking.stake(stakeAmount, [firstContract], [1], { from: memberOne });

    // check final stake
    const { staked: finalAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(totalAmount.eq(finalAmount), 'final amount should be equal to total staked amount');
  });

  it('should properly move tokens from each member to the PooledStaking contract', async function () {

    const { staking, token } = this;
    let expectedBalance = ether('0');

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakes = [
      { amount: ether('1'), contracts: [firstContract], allocations: [1], from: memberOne },
      { amount: ether('2'), contracts: [firstContract, secondContract], allocations: [1, 2], from: memberOne },
      { amount: ether('3'), contracts: [firstContract], allocations: [3], from: memberTwo },
      { amount: ether('4'), contracts: [firstContract, secondContract], allocations: [3, 4], from: memberTwo },
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

  it('should properly increase staked amounts for each contract', async function () {
    const { staking, token } = this;

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakes = [
      { amount: ether('1'), contracts: [firstContract], allocations: [ether('1')], from: memberOne },
      { amount: ether('2'), contracts: [firstContract, secondContract], allocations: [ether('1'), ether('2')], from: memberOne },
      { amount: ether('3'), contracts: [firstContract], allocations: [ether('3')], from: memberTwo },
      { amount: ether('4'), contracts: [firstContract, secondContract], allocations: [ether('3'), ether('4')], from: memberTwo },
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
        // returns the staked value instead of the whole struct
        // because the struct contains only one primitive
        const actualAmount = await staking.contracts(contract);
        const expectedAmount = expectedAmounts[contract];

        assert(
          actualAmount.eq(expectedAmount),
          `staked amount for ${contract} expected to be ${expectedAmount.toString()}, got ${actualAmount.toString()}`,
        );
      }
    }
  });

  it('should properly set staker contracts and their allocations', async function () {
    const { staking, token } = this;

    const amount = ether('1');
    const contracts = [firstContract, secondContract];
    const allocations = [amount, amount];

    await fundAndApprove(token, staking, amount, memberOne);
    await staking.stake(amount, contracts, allocations, { from: memberOne});

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
        `found allocations ${actualAllocations} should be identical to allocated allocations ${allocations}`,
    );

    assert.deepEqual(
        contracts, actualContracts,
        'found contracts should be identical to allocated contracts',
    );
  });

  it('should add staker to contract stakers array', async function () {

    const { staking, token } = this;
    const stakeAmount = ether('1');
    const totalAmount = ether('7');

    await fundAndApprove(token, staking, totalAmount, memberOne);

    // first allocation
    await staking.stake(stakeAmount, [firstContract], [10], { from: memberOne});

    const count = await staking.contractStakerCount(firstContract);
    const staker = await staking.contractStakerAtIndex(firstContract, 0);
    assert(count.eqn(1), `staker count for ${firstContract} should be 1`);
    assert(staker === memberOne, `staker at index 0 should match member address`);

    // second allocation
    const contracts = [firstContract, secondContract, thirdContract];
    const allocations = [10, 20, 30];
    await staking.stake(stakeAmount, contracts, allocations, { from: memberOne });

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
      assert(staker === memberOne, `staker at index 0 should be ${memberOne}`);
    }
  });

});
