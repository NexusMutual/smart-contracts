const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { StakingUintParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree, memberFour],
  governanceContracts: [governanceContract],
  internalContracts: [internalContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndApprove (token, tokenController, staking, amount, member) {
  const maxExposure = '2';

  await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
}

describe('withdraw', function () {
  it('should revert when called by non members', async function () {
    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(staking.withdraw(ether('1'), { from: nonMember }), 'Caller is not a member');
  });

  it('should decrease the total deposit amount of the staker  to 0 and emit Withdrawn event', async function () {
    const { token, tokenController, staking } = this;
    const totalAmount = ether('10');
    const withdrawAmount = ether('2');

    // fund accounts
    await fundAndApprove(token, tokenController, staking, totalAmount, memberOne);

    // deposit 10 and stake 6 on one contract
    await staking.depositAndStake(totalAmount, [firstContract], [ether('6')], { from: memberOne });
    const depositedBefore = await staking.stakerDeposit(memberOne);
    assert(depositedBefore.eq(totalAmount), `expected staked amount ${totalAmount}, found ${depositedBefore}`);

    // withdraw 2
    const tx = await staking.withdraw(withdrawAmount, { from: memberOne });
    expectEvent(tx, 'Withdrawn');

    // expect 8 deposited left
    const depositAfter = await staking.stakerDeposit(memberOne);
    const expectedDepositAfter = ether('0');
    assert(
      depositAfter.eq(expectedDepositAfter),
      `expected remaining staked amount ${expectedDepositAfter}, found ${depositAfter}`,
    );
  });

  it("should move the withdrawn tokens from the PooledStaking contract to the caller's address", async function () {
    const { token, tokenController, staking } = this;
    const depositAmount = ether('10');
    const stakedAmount = ether('6');

    // fund account, MAX_EXPOSURE = 2
    await fundAndApprove(token, tokenController, staking, depositAmount, memberOne);

    // deposit 10 and stake 6 on one contract
    await staking.depositAndStake(depositAmount, [firstContract], [stakedAmount], { from: memberOne });
    const memberOneDeposit = await staking.stakerDeposit(memberOne);
    assert(memberOneDeposit.eq(depositAmount), `expected deposit amount ${depositAmount}, found ${memberOneDeposit}`);

    // max withdrawable should be 4
    const expectedMaxWithdrawable = depositAmount.sub(stakedAmount);
    const maxWithdrawable = await staking.stakerMaxWithdrawable(memberOne);
    assert(
      maxWithdrawable.eq(expectedMaxWithdrawable),
      `max withdrawable is expected to be ${expectedMaxWithdrawable.toString()} but is ${maxWithdrawable.toString()}`,
    );

    // withdraw 4
    await staking.withdraw(ether('4'), { from: memberOne });

    // expect memberOne to have a balance of 4
    const memberOneBalance = await token.balanceOf(memberOne);
    const memberOneExpectedBalance = memberOneDeposit;
    assert(
      memberOneBalance.eq(memberOneExpectedBalance),
      `memberOne balance should be ${memberOneExpectedBalance}, found ${memberOneBalance}`,
    );
  });

  it('should revert if called with pending burns', async function () {
    const { token, tokenController, staking } = this;

    await fundAndApprove(token, tokenController, staking, ether('10'), memberOne);
    await staking.depositAndStake(ether('10'), [firstContract], [ether('6')], { from: memberOne });
    await time.increase(24 * 3600); // 1 day

    await staking.pushBurn(secondContract, ether('100'), { from: internalContract });
    await time.increase(3600); // 1 h

    await expectRevert(
      staking.withdraw(ether('2'), { from: memberOne }),
      'Unable to execute request with unprocessed burns',
    );

    await staking.processPendingActions('100');
    await time.increase(3600); // 1 h
    await staking.withdraw(ether('2'), { from: memberOne });
  });
});
