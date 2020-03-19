const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  // advisoryBoardMembers: [advisoryBoardMember],
  // internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

describe('stake', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.stake(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert if staked amount is less than MIN_DEPOSIT_AMOUNT', async function () {

    const { staking } = this;

    await staking.updateParameter(
      ParamType.MIN_DEPOSIT_AMOUNT,
      ether('10'),
      { from: governanceContract },
    );

    await expectRevert(
      staking.stake(ether('1'), { from: memberOne }),
      'Amount is less than minimum allowed',
    );

  });

  it('should revert when staking without allowance', async function () {

    const { staking, token } = this;
    const stakeAmount = ether('1');

    await token.transfer(memberOne, stakeAmount);

    await expectRevert(
      staking.stake(stakeAmount, { from: memberOne }),
      'ERC20: transfer amount exceeds allowance.',
    );
  });

  it('should add the staked amount to the total user stake', async function () {

    const { staking, token } = this;
    const { staked: stakedBefore } = await staking.stakers(memberOne, { from: memberOne });
    const stakeAmount = ether('1');
    const totalAmount = ether('2');

    assert(stakedBefore.eqn(0), 'initial amount should be 0');

    await token.transfer(memberOne, totalAmount); // fund account

    // stake 1 nxm
    await token.approve(staking.address, ether('1'), { from: memberOne });
    await staking.stake(stakeAmount, { from: memberOne });

    // check first stake
    const { staked: firstAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(firstAmount.eq(stakeAmount), 'amount should be equal to staked amount');

    // stake 1 nxm
    await token.approve(staking.address, ether('1'), { from: memberOne });
    await staking.stake(stakeAmount, { from: memberOne });

    // check final stake
    const { staked: finalAmount } = await staking.stakers(memberOne, { from: memberOne });
    assert(totalAmount.eq(finalAmount), 'final amount should be equal to total staked amount');
  });

  it('should properly move tokens from each member to the PooledStaking contract', async function () {

    const { staking, token } = this;
    let expectedBalance = ether('0');

    // fund accounts
    await token.transfer(memberOne, ether('10'));
    await token.transfer(memberTwo, ether('10'));

    const stakes = [
      { from: memberOne, amount: ether('1') },
      { from: memberTwo, amount: ether('4') },
      { from: memberOne, amount: ether('3') },
      { from: memberTwo, amount: ether('2') },
    ];

    for (const stake of stakes) {
      const { from, amount } = stake;

      await token.approve(staking.address, amount, { from });
      await staking.stake(amount, { from });

      expectedBalance = expectedBalance.add(amount);
      const currentBalance = await token.balanceOf(staking.address);

      assert(
        currentBalance.eq(expectedBalance),
        `staking contract balance should be ${expectedBalance.toString()}`,
      );
    }

    const memberOneBalance = await token.balanceOf(memberOne);
    const memberTwoBalance = await token.balanceOf(memberTwo);

    const memberOneExpectedBalance = ether('10').sub(ether('4'));
    const memberTwoExpectedBalance = ether('10').sub(ether('4')).sub(ether('2'));

    assert(memberOneBalance.eq(memberOneExpectedBalance), 'memberOne balance should be decreased accordingly');
    assert(memberTwoBalance.eq(memberTwoExpectedBalance), 'memberTwo balance should be decreased accordingly');
  });

  it('should properly increase staked amounts for each contract', async function () {

    const { staking, token } = this;
    const maxLeverage = 1000 * 100; // 1000%

    const firstContract = '0x0000000000000000000000000000000000000001';
    const secondContract = '0x0000000000000000000000000000000000000002';
    const contracts = [firstContract, secondContract];

    const allocations = {
      [memberOne]: [40, 70].map(i => i * 100),
      [memberTwo]: [50, 60].map(i => i * 100),
    };

    const stakes = [
      { from: memberOne, amount: ether('1'), allocate: true },
      { from: memberTwo, amount: ether('4'), allocate: true },
      { from: memberOne, amount: ether('3'), allocate: false },
      { from: memberTwo, amount: ether('2'), allocate: false },
    ];

    const allExpectedAmounts = [
      { [firstContract]: ether('0.4'), [secondContract]: ether('0.7') },
      { [firstContract]: ether('2.4'), [secondContract]: ether('3.1') },
      { [firstContract]: ether('3.6'), [secondContract]: ether('5.2') },
      { [firstContract]: ether('4.6'), [secondContract]: ether('6.4') },
    ];

    await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

    // fund accounts
    await token.transfer(memberOne, ether('10'));
    await token.transfer(memberTwo, ether('10'));

    // stake and check staked amounts for each contract
    for (let i = 0; i < stakes.length; i++) {

      const { from, amount, allocate } = stakes[i];
      const expectedAmounts = allExpectedAmounts[i];

      await token.approve(staking.address, amount, { from });
      await staking.stake(amount, { from });

      if (allocate) {
        await staking.setAllocations(contracts, allocations[from], { from });
      }

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

});
