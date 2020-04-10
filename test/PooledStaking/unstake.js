const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';

async function fundAndApprove (token, staking, amount, member) {
  const maxLeverage = '2';

  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe('unstake', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.unstake(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert if requested amount exceeds max unstakable amount', async function () {

    const { token, staking } = this;
    const amount = ether('1');

    // Fund accounts
    await fundAndApprove(token, staking, amount, memberOne);
    await fundAndApprove(token, staking, amount, memberTwo);

    // Stake and allocate the entire stake
    await staking.stake(amount, [firstContract, secondContract], [amount, amount], { from: memberOne });
    const { staked: stakedBeforeMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert.strictEqual(stakedBeforeMemberOne.toString(), amount.toString());

    await expectRevert(
      staking.unstake(amount, { from: memberOne }),
      'Requested amount exceeds max unstakable amount',
    );

    // Stake and allocate the entire stake, unleveraged
    await staking.stake(amount, [firstContract], [amount], { from: memberTwo });
    const { staked: stakedBeforeMemberTwo } = await staking.stakers(memberOne, { from: memberTwo });
    assert.strictEqual(stakedBeforeMemberTwo.toString(), amount.toString());

    await expectRevert(
      staking.unstake(amount, { from: memberTwo }),
      'Requested amount exceeds max unstakable amount',
    );
  });

  it('should decrease the total staked amount of the staker', async function () {
    const { token, staking } = this;
    const totalAmount = ether('10');
    const unstakeAmount = ether('2');

    // Fund accounts
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake and allocate partial amount
    await staking.stake(totalAmount, [firstContract], [ether('5')], { from: memberOne });
    const { staked: stakedBefore } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedBefore.eq(totalAmount));

    // Unstake
    await staking.unstake(unstakeAmount, { from: memberOne });
    const { staked: stakedAfter } = await staking.stakers(memberOne, { from: memberOne });
    const expectedStakedAfter = totalAmount.sub(unstakeAmount);
    assert(stakedAfter.eq(expectedStakedAfter));
  });

  it('should return the correct max unstakable', async function () {
    const { token, staking } = this;
    const totalAmount = ether('10');
    const allocatedAmount = ether('5');

    // Fund accounts
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake and allocate partial amount
    await staking.stake(totalAmount, [firstContract], [allocatedAmount], { from: memberOne });
    const { staked: stakedMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOne.eq(totalAmount));

    // Check max unstakable
    const expectedMaxUnstakable = totalAmount.sub(allocatedAmount);
    const maxUnstakable = await staking.getMaxUnstakable(memberOne);
    assert(maxUnstakable.eq(expectedMaxUnstakable), `Max unstakable is expected to be ${expectedMaxUnstakable.toString()} but is ${maxUnstakable.toString()}`);

    // Allocate all staked amount
    await staking.stake(ether('0'), [firstContract, secondContract], [totalAmount, totalAmount], { from: memberOne });
    const { staked: stakedMemberOneTotal } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOneTotal.eq(totalAmount));

    // Check max unstakable is 0
    const maxUnstakableTotal = await staking.getMaxUnstakable(memberOne);
    assert(maxUnstakableTotal.eq(ether('0')));
  });

});
