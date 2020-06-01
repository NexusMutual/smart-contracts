const { ether, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType } = require('../utils').constants;
const setup = require('../setup');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree, memberFour],
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

describe('withdraw', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.withdraw(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert if requested amount exceeds max withdrawable amount', async function () {

    const { token, staking } = this;
    let maxWithdrawable;

    // member 1: deposit 10 and stake the entire deposit, up to max exposure
    const amountOne = ether('10');
    await fundAndApprove(token, staking, amountOne, memberOne);
    await staking.depositAndStake(amountOne, [firstContract, secondContract], [amountOne, amountOne], { from: memberOne });
    const memberOneDeposit = await staking.stakerDeposit(memberOne);
    assert(memberOneDeposit.eq(amountOne), `expected deposit for memberOne ${amountOne}, found ${memberOneDeposit}`);

    // nothing to withdraw
    maxWithdrawable = await staking.getMaxWithdrawable(memberOne);
    assert(maxWithdrawable.eq(ether('0')));
    await expectRevert(
      staking.withdraw(amountOne, { from: memberOne }),
      'Requested amount exceeds max withdrawable amount',
    );

    // member 2: deposit 8 and stake the entire deposit on 1 contract (exposure = 1)
    const amountTwo = ether('8');
    await fundAndApprove(token, staking, amountTwo, memberTwo);
    await staking.depositAndStake(amountTwo, [firstContract], [amountTwo], { from: memberTwo });
    const memberTwoDeposit = await staking.stakerDeposit(memberTwo);
    assert(memberTwoDeposit.eq(amountTwo), `expected deposit for memberTwo ${amountTwo}, found ${memberTwoDeposit}`);

    // nothing to withdraw
    maxWithdrawable = await staking.getMaxWithdrawable(memberTwo);
    assert(maxWithdrawable.eq(ether('0')));
    await expectRevert(
      staking.withdraw(amountTwo, { from: memberTwo }),
      'Requested amount exceeds max withdrawable amount',
    );

    // member 3: deposit 7 and stake [5, 3] on two contracts
    const amountThree = ether('7');
    await fundAndApprove(token, staking, amountThree, memberThree);
    await staking.depositAndStake(amountThree, [firstContract, secondContract], [ether('5'), ether('3')], { from: memberThree });
    const memberThreeDeposit = await staking.stakerDeposit(memberThree);
    assert(
      memberThreeDeposit.eq(amountThree),
      `expected deposit for memberThree ${amountThree}, found ${memberThreeDeposit}`,
    );

    // can withdraw 2
    maxWithdrawable = await staking.getMaxWithdrawable(memberThree);
    assert(maxWithdrawable.eq(ether('2')), `expected max withdrawable ${ether('2')}, found ${maxWithdrawable}`);
    await expectRevert(
      staking.withdraw(amountThree, { from: memberThree }),
      'Requested amount exceeds max withdrawable amount',
    );
    await staking.withdraw(ether('2'), { from: memberThree });

    // member 4: deposit 45, stake [15, 15, 15], expect 22.5 withdrawable
    const amountFour = ether('45');
    await fundAndApprove(token, staking, amountFour, memberFour);
    await staking.depositAndStake(
      amountFour,
      [firstContract, secondContract, thirdContract],
      [ether('15'), ether('15'), ether('15')],
      { from: memberFour },
    );

    const memberFourDeposit = await staking.stakerDeposit(memberFour);
    assert(
      memberFourDeposit.eq(amountFour),
      `expected deposit for memberFour ${amountFour}, found ${memberFourDeposit}`,
    );

    // can withdraw 22.5
    maxWithdrawable = await staking.getMaxWithdrawable(memberFour);
    assert(maxWithdrawable.eq(ether('22.5')), `expected max withdrawable ${ether('22.5')}, found ${maxWithdrawable}`);
    await expectRevert(
      staking.withdraw(ether('22.501'), { from: memberFour }),
      'Requested amount exceeds max withdrawable amount',
    );
    await staking.withdraw(ether('22.5'), { from: memberFour });
  });

  it('should decrease the total deposit amount of the staker and emit Withdrawn event', async function () {
    const { token, staking } = this;
    const totalAmount = ether('10');
    const withdrawAmount = ether('2');

    // fund accounts
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // deposit 10 and stake 6 on one contract
    await staking.depositAndStake(totalAmount, [firstContract], [ether('6')], { from: memberOne });
    const depositedBefore = await staking.stakerDeposit(memberOne);
    assert(depositedBefore.eq(totalAmount), `expected staked amount ${totalAmount}, found ${depositedBefore}`);

    // withdraw 2
    const tx = await staking.withdraw(withdrawAmount, { from: memberOne });
    expectEvent(tx, 'Withdrawn');

    // expect 8 deposited left
    const depositAfter = await staking.stakerDeposit(memberOne);
    const expectedDepositAfter = totalAmount.sub(withdrawAmount);
    assert(depositAfter.eq(expectedDepositAfter), `expected remaining staked amount ${expectedDepositAfter}, found ${depositAfter}`);
  });

  it("should move the withdrawn tokens from the PooledStaking contract to the caller's address", async function () {

    const { token, staking } = this;
    const depositAmount = ether('10');
    const stakedAmount = ether('6');

    // fund account, MAX_EXPOSURE = 2
    await fundAndApprove(token, staking, depositAmount, memberOne);

    // deposit 10 and stake 6 on one contract
    await staking.depositAndStake(depositAmount, [firstContract], [stakedAmount], { from: memberOne });
    const memberOneDeposit = await staking.stakerDeposit(memberOne);
    assert(memberOneDeposit.eq(depositAmount), `expected deposit amount ${depositAmount}, found ${memberOneDeposit}`);

    // max withdrawable should be 4
    const expectedMaxWithdrawable = depositAmount.sub(stakedAmount);
    const maxWithdrawable = await staking.getMaxWithdrawable(memberOne);
    assert(
      maxWithdrawable.eq(expectedMaxWithdrawable),
      `max withdrawable is expected to be ${expectedMaxWithdrawable.toString()} but is ${maxWithdrawable.toString()}`,
    );

    // withdraw 4
    await staking.withdraw(ether('4'), { from: memberOne });

    // expect memberOne to have a balance of 4
    const memberOneBalance = await token.balanceOf(memberOne);
    const memberOneExpectedBalance = ether('4');
    assert(
      memberOneBalance.eq(memberOneExpectedBalance),
      `memberOne balance should be ${memberOneExpectedBalance}, found ${memberOneBalance}`,
    );
  });

});
