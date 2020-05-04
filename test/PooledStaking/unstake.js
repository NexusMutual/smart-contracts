const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo, memberThree],
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
    const amountOne = ether('10');
    const amountTwo = ether('8');
    const amountThree = ether('6');

    // Fund accounts
    await fundAndApprove(token, staking, amountOne, memberOne);
    await fundAndApprove(token, staking, amountTwo, memberTwo);
    await fundAndApprove(token, staking, amountThree, memberThree);

    // Stake and allocate the entire stake, up to max leverage
    await staking.stake(amountOne, [firstContract, secondContract], [amountOne, amountOne], { from: memberOne });
    const { staked: stakedMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOne.eq(amountOne), `expected staked amount for memberOne ${amountOne}, found ${stakedMemberOne}`);

    // Nothing to unstake
    await expectRevert(
      staking.unstake(amountOne, { from: memberOne }),
      'Requested amount exceeds max unstakable amount',
    );

    // Stake and allocate the entire stake, unleveraged
    await staking.stake(amountTwo, [firstContract], [amountTwo], { from: memberTwo });
    const { staked: stakedMemberTwo } = await staking.stakers(memberTwo, { from: memberTwo });
    assert(stakedMemberTwo.eq(amountTwo), `expected staked amount for memberTwo ${amountTwo}, found ${stakedMemberTwo}`);

    // Nothing to unstake
    await expectRevert(
      staking.unstake(amountTwo, { from: memberTwo }),
      'Requested amount exceeds max unstakable amount',
    );

    // Stake and partially allocate the stake
    await staking.stake(amountThree, [firstContract], [ether('5')], { from: memberThree });
    const { staked: stakedMemberThree } = await staking.stakers(memberThree, { from: memberThree });
    assert(
      stakedMemberThree.eq(amountThree),
      `expected staked amount for memberThree ${amountThree}, found ${stakedMemberThree}`,
    );

    // Can unstake ether('1')
    await expectRevert(
      staking.unstake(amountThree, { from: memberThree }),
      'Requested amount exceeds max unstakable amount',
    );
    await staking.unstake(ether('1'), { from: memberThree});
  });

  it('should decrease the total stake amount of the staker', async function () {
    const { token, staking } = this;
    const totalAmount = ether('10');
    const unstakeAmount = ether('2');

    // Fund accounts
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake and allocate partial amount
    await staking.stake(totalAmount, [firstContract], [ether('5')], { from: memberOne });
    const { staked: stakedBefore } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedBefore.eq(totalAmount), `expected staked amount ${totalAmount}, found ${stakedBefore}`);

    // Unstake
    await staking.unstake(unstakeAmount, { from: memberOne });
    const { staked: stakedAfter } = await staking.stakers(memberOne, { from: memberOne });
    const expectedStakedAfter = totalAmount.sub(unstakeAmount);
    assert(stakedAfter.eq(expectedStakedAfter), `expected remaining staked amount ${expectedStakedAfter}, found ${stakedAfter}`);
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
    assert(stakedMemberOne.eq(totalAmount), `expected staked amount ${totalAmount}, found ${stakedMemberOne}`);

    // Check max unstakable
    const expectedMaxUnstakable = totalAmount.sub(allocatedAmount);
    const maxUnstakable = await staking.getMaxUnstakable(memberOne);
    assert(
      maxUnstakable.eq(expectedMaxUnstakable),
      `Max unstakable is expected to be ${expectedMaxUnstakable.toString()} but is ${maxUnstakable.toString()}`,
    );

    // Allocate all staked amount
    await staking.stake(ether('0'), [firstContract, secondContract], [totalAmount, totalAmount], { from: memberOne });
    const { staked: stakedMemberOneTotal } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOneTotal.eq(totalAmount));

    // Check max unstakable is 0
    const maxUnstakableTotal = await staking.getMaxUnstakable(memberOne);
    assert(maxUnstakableTotal.eq(ether('0')));
  });

  it('should move the unstaked tokens from the PooledStaking contract to the caller\'s address', async function () {

    const { token, staking } = this;
    const totalAmount = ether('10');
    const allocatedAmount = ether('6');

    // fund account
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake and allocate partial amount
    await staking.stake(totalAmount, [firstContract], [allocatedAmount], { from: memberOne });
    const { staked: stakedMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOne.eq(totalAmount), `expected staked amount ${totalAmount}, found ${stakedMemberOne}`);

    // Check max unstakable
    const expectedMaxUnstakable = totalAmount.sub(allocatedAmount);
    const maxUnstakable = await staking.getMaxUnstakable(memberOne);
    assert(
      maxUnstakable.eq(expectedMaxUnstakable),
      `Max unstakable is expected to be ${expectedMaxUnstakable.toString()} but is ${maxUnstakable.toString()}`,
    );

    // Unstake available amount
    await staking.unstake(ether('4'), { from: memberOne });

    // Expect to have a balance of ether('4')
    const memberOneBalance = await token.balanceOf(memberOne);
    const memberOneExpectedBalance = ether('4');
    assert(
      memberOneBalance.eq(memberOneExpectedBalance),
      `memberOne balance should be ${memberOneExpectedBalance}, found ${memberOneBalance}`,
    );
  });

});
