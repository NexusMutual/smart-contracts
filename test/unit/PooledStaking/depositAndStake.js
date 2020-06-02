const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

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
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndApprove (token, staking, amount, member) {
  const maxExposure = '2';
  await staking.updateParameter(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe('depositAndStake', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.depositAndStake(ether('1'), [firstContract], [1], { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert when staking to fewer contracts than already staked', async function () {

    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne);
    // first stake
    await staking.depositAndStake(amount, [firstContract, secondContract], [1, 1], { from: memberOne });

    // second stake, staking to an incomplete list of contracts
    await expectRevert(
      staking.depositAndStake(amount, [thirdContract], [1], { from: memberOne }),
      'Staking on fewer contracts is not allowed',
    );
  });

  it('should revert when input array contains duplicate values', async function () {

    const { staking, token } = this;
    const amount = ether('3');

    await fundAndApprove(token, staking, amount.muln(2), memberOne);

    await expectRevert(
      staking.depositAndStake(amount, [firstContract, secondContract, secondContract], [1, 1, 1], { from: memberOne }),
      'Contracts array should not contain duplicates',
    );

    await staking.depositAndStake(amount, [firstContract, secondContract], [1, 1], { from: memberOne });

    await expectRevert(
      staking.depositAndStake(amount, [firstContract, secondContract, firstContract], [2, 2, 2], { from: memberOne }),
      'Contracts array should not contain duplicates',
    );
  });

  it('should revert when contracts and stakes arrays lengths differ', async function () {

    const { staking } = this;

    await expectRevert(
      staking.depositAndStake(ether('7'), [firstContract, secondContract], [1], { from: memberOne }),
      'Contracts and stakes arrays should have the same length',
    );
  });

  it('should prevent staking < MIN_STAKE', async function () {

    const { staking, token } = this;
    const minStake = ether('20');
    const amount = ether('1');

    await staking.updateParameter(ParamType.MIN_STAKE, minStake, { from: governanceContract });
    await fundAndApprove(token, staking, amount, memberOne);

    await expectRevert(
      staking.depositAndStake(amount, [firstContract], [ether('10')], { from: memberOne }),
      'Minimum stake amount not met',
    );
  });

  it('should prevent staking on a contract more than deposited', async function () {

    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne);

    await expectRevert(
      staking.depositAndStake(amount, [firstContract], [ether('2')], { from: memberOne }),
      'Cannot stake more than deposited',
    );
  });

  it('should revert when contracts order has been changed', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('10');
    const totalAmount = ether('20');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.depositAndStake(stakeAmount, [firstContract, secondContract], [stakeAmount, stakeAmount], { from: memberOne });

    // second stake, with contracts passed in the wrong order
    await expectRevert(
      staking.depositAndStake(stakeAmount, [secondContract, firstContract], [stakeAmount, stakeAmount], { from: memberOne }),
      'Unexpected contract order',
    );
  });

  it('should revert when new stake is less than previous one', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('10');
    const totalAmount = ether('20');

    await fundAndApprove(token, staking, totalAmount, memberOne);
    // first stake
    await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // second stake, with a smaller stake amount than the existing one
    await expectRevert(
      staking.depositAndStake(stakeAmount, [firstContract], [ether('7')], { from: memberOne }),
      'New stake is less than previous stake',
    );
  });

  it('should revert when total stake exceeds maximum allowed (based on exposure)', async function () {
    const { staking, token } = this;
    const amount = ether('1');

    await fundAndApprove(token, staking, amount, memberOne); // MAX_EXPOSURE = 2

    // Stake 3x the deposited amount, when MAX_EXPOSURE = 2
    await expectRevert(
      staking.depositAndStake(
        amount,
        [firstContract, secondContract, thirdContract],
        [amount, amount, amount],
        { from: memberOne },
      ),
      'Total stake exceeds maximum allowed',
    );
  });

  it('should revert when staking without allowance', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('1');

    // fund from default account
    await token.transfer(memberOne, stakeAmount);

    await expectRevert(
      staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne }),
      'ERC20: transfer amount exceeds allowance.',
    );
  });

  it('should update the deposit of the staker and properly emit Staked and Deposited events', async function () {
    const { staking, token } = this;
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    await fundAndApprove(token, staking, totalAmount, memberOne);

    // stake 1 nxm
    let tx = await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });
    await expectEvent(tx, 'Staked', { contractAddress: firstContract, staker: memberOne, amount: stakeAmount });
    await expectEvent(tx, 'Deposited', { amount: stakeAmount, staker: memberOne });

    // check first stake
    const firstAmount = await staking.stakerDeposit(memberOne);
    assert(firstAmount.eq(stakeAmount), 'amount should be equal to staked amount');

    // stake 1 nxm
    tx = await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });
    await expectEvent(tx, 'Deposited', { amount: stakeAmount, staker: memberOne });

    const emittedEvents = tx.logs.map(log => log.event);
    assert.equal(emittedEvents.length, 1, 'should fire a single event');
    assert.isFalse(emittedEvents.includes('Staked'), 'should not fire a Staked event as no new stake took place');

    // check final deposit
    const finalAmount = await staking.stakerDeposit(memberOne);
    assert(finalAmount.eq(totalAmount), 'final amount should be equal to deposited amount');
  });

  it('should allow calling depositAndStake with 0 deposit', async function () {
    const { staking, token } = this;

    const amount = ether('10');
    const contracts = [firstContract, secondContract];
    const stakes = [ether('5'), ether('5')];

    await fundAndApprove(token, staking, amount, memberOne);
    // First stake
    await staking.depositAndStake(amount, contracts, stakes, { from: memberOne });

    // Stake more on the contracts they already staked, without increasing the deposit
    await staking.depositAndStake(0, contracts, [ether('6'), ether('6')], { from: memberOne });
    const sameDeposit = await staking.stakerDeposit(memberOne);
    assert(sameDeposit.eq(amount), 'amount staked should be the same');

    // Stake on one more contract, without increasing the deposit amount
    const tx = await staking.depositAndStake(
      0,
      [firstContract, secondContract, thirdContract],
      [ether('6'), ether('6'), ether('2')],
      { from: memberOne },
    );

    expectEvent(tx, 'Staked');
    const events = tx.logs.map(log => log.event);
    assert.isFalse(events.includes('Deposited'), 'should not emit Deposited when depositAndStake with 0 amount');

    const sameDepositAgain = await staking.stakerDeposit(memberOne);
    assert(sameDepositAgain.eq(amount), 'deposited amount should be the same');
  });

  it('should move tokens from the caller to the PooledStaking contract', async function () {

    const { staking, token } = this;
    let expectedBalance = ether('0');

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakers = [
      { amount: ether('1'), contracts: [firstContract], stakes: [ether('1')], from: memberOne },
      {
        amount: ether('2'),
        contracts: [firstContract, secondContract],
        stakes: [ether('1'), ether('2')],
        from: memberOne,
      },
      { amount: ether('3'), contracts: [firstContract], stakes: [ether('3')], from: memberTwo },
      {
        amount: ether('4'),
        contracts: [firstContract, secondContract],
        stakes: [ether('3'), ether('4')],
        from: memberTwo,
      },
    ];

    for (const stake of stakers) {
      const { amount, contracts, stakes, from } = stake;

      await staking.depositAndStake(amount, contracts, stakes, { from });

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

  it('should increase the stake amount for each contract given as input', async function () {
    const { staking, token } = this;

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakers = [
      { amount: ether('1'), contracts: [firstContract], stakes: [ether('1')], from: memberOne },
      {
        amount: ether('2'),
        contracts: [firstContract, secondContract],
        stakes: [ether('1'), ether('2')],
        from: memberOne,
      },
      { amount: ether('3'), contracts: [firstContract], stakes: [ether('3')], from: memberTwo },
      {
        amount: ether('4'),
        contracts: [firstContract, secondContract],
        stakes: [ether('3'), ether('4')],
        from: memberTwo,
      },
    ];

    const allExpectedAmounts = [
      { [firstContract]: ether('1'), [secondContract]: ether('0') },
      { [firstContract]: ether('1'), [secondContract]: ether('2') },
      { [firstContract]: ether('4'), [secondContract]: ether('2') },
      { [firstContract]: ether('4'), [secondContract]: ether('6') },
    ];

    for (let i = 0; i < stakers.length; i++) {
      const { amount, contracts, stakes, from } = stakers[i];
      const expectedAmounts = allExpectedAmounts[i];

      await staking.depositAndStake(amount, contracts, stakes, { from });

      for (const contract of Object.keys(expectedAmounts)) {
        const actualAmount = await staking.contractStake(contract);
        const expectedAmount = expectedAmounts[contract];

        assert(
          actualAmount.eq(expectedAmount),
          `staked amount for ${contract} expected to be ${expectedAmount.toString()}, got ${actualAmount.toString()}`,
        );
      }
    }
  });

  it('should update the staker stake for each contract given as input', async function () {

    const { staking, token } = this;

    // fund accounts
    await fundAndApprove(token, staking, ether('10'), memberOne);
    await fundAndApprove(token, staking, ether('10'), memberTwo);

    const stakers = [
      { amount: ether('1'), contracts: [firstContract], stakes: [ether('1')], from: memberOne },
      {
        amount: ether('2'),
        contracts: [firstContract, secondContract],
        stakes: [ether('1'), ether('2')],
        from: memberOne,
      },
      { amount: ether('3'), contracts: [firstContract], stakes: [ether('3')], from: memberTwo },
      {
        amount: ether('4'),
        contracts: [firstContract, secondContract],
        stakes: [ether('3'), ether('4')],
        from: memberTwo,
      },
    ];

    const allExpectedAmounts = [
      { [firstContract]: ether('1'), [secondContract]: ether('0') },
      { [firstContract]: ether('1'), [secondContract]: ether('2') },
      { [firstContract]: ether('3'), [secondContract]: ether('0') },
      { [firstContract]: ether('3'), [secondContract]: ether('4') },
    ];

    for (let i = 0; i < stakers.length; i++) {
      const { amount, contracts, stakes, from } = stakers[i];
      const expectedAmounts = allExpectedAmounts[i];

      await staking.depositAndStake(amount, contracts, stakes, { from });

      for (const contract of Object.keys(expectedAmounts)) {
        const actualStake = await staking.stakerContractStake(from, contract);
        const expectedStake = expectedAmounts[contract];

        assert(
          actualStake.eq(expectedStake),
          `staked amount for ${contract} expected to be ${expectedStake}, got ${actualStake}`,
        );
      }
    }
  });

  it("should push new contracts to staker's contracts and contract's stakers", async function () {
    const { staking, token } = this;

    const amount = ether('10');
    const contracts = [firstContract, secondContract];
    const stakes = [ether('5'), ether('5')];

    await fundAndApprove(token, staking, amount, memberOne);

    // Deposit and stake on 2 contracts
    await staking.depositAndStake(amount, contracts, stakes, { from: memberOne });

    const length = await staking.stakerContractCount(memberOne);
    const actualContracts = [];
    const actualStakes = [];

    for (let i = 0; i < length; i++) {
      const contract = await staking.stakerContractAtIndex(memberOne, i);
      const stake = await staking.stakerContractStake(memberOne, contract);
      actualContracts.push(contract);
      actualStakes.push(stake);
    }

    assert.deepEqual(
      stakes.map(stake => stake.toString()),
      actualStakes.map(stake => stake.toString()),
      `found stakes ${actualStakes} should be identical to actual stakes ${stakes}`,
    );

    assert.deepEqual(
      contracts, actualContracts,
      'found contracts should be identical to actual contracts',
    );

    const newContracts = [firstContract, secondContract, thirdContract];
    const newStakes = [ether('5'), ether('5'), ether('6')];

    // Stake on 3 contracts
    await staking.depositAndStake(0, newContracts, newStakes, { from: memberOne });

    const newLength = await staking.stakerContractCount(memberOne);
    const newActualContracts = [];
    const newActualStakes = [];

    for (let i = 0; i < newLength; i++) {
      const contract = await staking.stakerContractAtIndex(memberOne, i);
      const stake = await staking.stakerContractStake(memberOne, contract);
      newActualContracts.push(contract);
      newActualStakes.push(stake);
    }

    assert.deepEqual(
      newStakes.map(stake => stake.toString()),
      newActualStakes.map(stake => stake.toString()),
      `found new stakes ${newActualStakes} should be identical to new actual stakes ${newStakes}`,
    );

    assert.deepEqual(
      newContracts, newActualContracts,
      'found new contracts should be identical to new actual contracts',
    );
  });

});
