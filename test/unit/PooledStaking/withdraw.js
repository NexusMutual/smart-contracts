const { expectRevert, ether } = require('@openzeppelin/test-helpers');
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
    let maxUnstakable;

    // Member 1: Stake 10 and allocate the entire stake, up to max leverage
    const amountOne = ether('10');
    await fundAndApprove(token, staking, amountOne, memberOne);
    await staking.stake(amountOne, [firstContract, secondContract], [amountOne, amountOne], { from: memberOne });
    const { staked: stakedMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOne.eq(amountOne), `expected staked amount for memberOne ${amountOne}, found ${stakedMemberOne}`);

    // Nothing to unstake
    maxUnstakable = await staking.getMaxUnstakable(memberOne);
    assert(maxUnstakable.eq(ether('0')));
    await expectRevert(
      staking.unstake(amountOne, { from: memberOne }),
      'Requested amount exceeds max unstakable amount',
    );

    // Member 2: Stake 8 and allocate the entire stake on 1 contract (unleveraged)
    const amountTwo = ether('8');
    await fundAndApprove(token, staking, amountTwo, memberTwo);
    await staking.stake(amountTwo, [firstContract], [amountTwo], { from: memberTwo });
    const { staked: stakedMemberTwo } = await staking.stakers(memberTwo, { from: memberTwo });
    assert(stakedMemberTwo.eq(amountTwo), `expected staked amount for memberTwo ${amountTwo}, found ${stakedMemberTwo}`);

    // Nothing to unstake
    maxUnstakable = await staking.getMaxUnstakable(memberTwo);
    assert(maxUnstakable.eq(ether('0')));
    await expectRevert(
      staking.unstake(amountTwo, { from: memberTwo }),
      'Requested amount exceeds max unstakable amount',
    );

    // Member 3: Stake 7 and allocate [5, 3] on two contracts
    const amountThree = ether('7');
    await fundAndApprove(token, staking, amountThree, memberThree);
    await staking.stake(amountThree, [firstContract, secondContract], [ether('5'), ether('3')], { from: memberThree });
    const { staked: stakedMemberThree } = await staking.stakers(memberThree, { from: memberThree });
    assert(
      stakedMemberThree.eq(amountThree),
      `expected staked amount for memberThree ${amountThree}, found ${stakedMemberThree}`,
    );

    // Can unstake 2
    maxUnstakable = await staking.getMaxUnstakable(memberThree);
    assert(maxUnstakable.eq(ether('2')), `expected max unstakable ${ether('2')}, found ${maxUnstakable}`);
    await expectRevert(
      staking.unstake(amountThree, { from: memberThree }),
      'Requested amount exceeds max unstakable amount',
    );
    await staking.unstake(ether('2'), { from: memberThree });

    // Member 4: Stake 45, allocate [15, 15, 15], expect 22.5 unstakable
    const amountFour = ether('45');
    await fundAndApprove(token, staking, amountFour, memberFour);
    await staking.stake(
      amountFour,
      [firstContract, secondContract, thirdContract],
      [ether('15'), ether('15'), ether('15')],
      { from: memberFour },
    );

    const { staked: stakedMemberFour } = await staking.stakers(memberFour, { from: memberFour });
    assert(
      stakedMemberFour.eq(amountFour),
      `expected staked amount for memberFour ${amountFour}, found ${stakedMemberFour}`,
    );

    // Can unstake 22.5
    maxUnstakable = await staking.getMaxUnstakable(memberFour);
    assert(maxUnstakable.eq(ether('22.5')), `expected max unstakable ${ether('22.5')}, found ${maxUnstakable}`);
    await expectRevert(
      staking.unstake(ether('22.501'), { from: memberFour }),
      'Requested amount exceeds max unstakable amount',
    );
    await staking.unstake(ether('22.5'), { from: memberFour });
  });

  it('should decrease the total stake amount of the staker', async function () {
    const { token, staking } = this;
    const totalAmount = ether('10');
    const unstakeAmount = ether('2');

    // Fund accounts
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake 10 and allocate 6 on one contract
    await staking.stake(totalAmount, [firstContract], [ether('6')], { from: memberOne });
    const { staked: stakedBefore } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedBefore.eq(totalAmount), `expected staked amount ${totalAmount}, found ${stakedBefore}`);

    // Unstake 2
    await staking.unstake(unstakeAmount, { from: memberOne });

    // Expect 8 staked left
    const { staked: stakedAfter } = await staking.stakers(memberOne, { from: memberOne });
    const expectedStakedAfter = totalAmount.sub(unstakeAmount);
    assert(stakedAfter.eq(expectedStakedAfter), `expected remaining staked amount ${expectedStakedAfter}, found ${stakedAfter}`);
  });

  it('should move the unstaked tokens from the PooledStaking contract to the caller\'s address', async function () {

    const { token, staking } = this;
    const totalAmount = ether('10');
    const allocatedAmount = ether('6');

    // fund account, MAX_LEVERAGE = 2
    await fundAndApprove(token, staking, totalAmount, memberOne);

    // Stake 10 and allocate 6 on one contract
    await staking.stake(totalAmount, [firstContract], [allocatedAmount], { from: memberOne });
    const { staked: stakedMemberOne } = await staking.stakers(memberOne, { from: memberOne });
    assert(stakedMemberOne.eq(totalAmount), `expected staked amount ${totalAmount}, found ${stakedMemberOne}`);

    // Max unstakable should be 4
    const expectedMaxUnstakable = totalAmount.sub(allocatedAmount);
    const maxUnstakable = await staking.getMaxUnstakable(memberOne);
    assert(
      maxUnstakable.eq(expectedMaxUnstakable),
      `Max unstakable is expected to be ${expectedMaxUnstakable.toString()} but is ${maxUnstakable.toString()}`,
    );

    // Unstake 4
    await staking.unstake(ether('4'), { from: memberOne });

    // Expect memberOne to have a balance of 4
    const memberOneBalance = await token.balanceOf(memberOne);
    const memberOneExpectedBalance = ether('4');
    assert(
      memberOneBalance.eq(memberOneExpectedBalance),
      `memberOne balance should be ${memberOneExpectedBalance}, found ${memberOneBalance}`,
    );
  });

});
