const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const setup = require('../setup');
const { ParamType } = require('../utils').constants;

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';

async function fundAndApprove (token, staking, amount, member) {
  const maxExposure = '2';
  await staking.updateParameter(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe.only('withdrawReward', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.withdrawReward(nonMember, ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  it('should revert if requested amount exceeds available reward', async function () {
    const { token, staking } = this;

    // No rewards available
    await expectRevert(
      staking.withdrawReward(memberOne, ether('1'), { from: memberOne }),
      'Requested amount exceeds available reward',
    );

    // MemberOne stakes 10 on firstContract
    const stakeAmountOne = ether('10');
    await fundAndApprove(token, staking, stakeAmountOne, memberOne);
    await staking.depositAndStake(stakeAmountOne, [firstContract], [stakeAmountOne], { from: memberOne });

    // MemberTwo stakes 20 on firstContract
    const stakeAmountTwo = ether('20');
    await fundAndApprove(token, staking, stakeAmountTwo, memberTwo);
    await staking.depositAndStake(stakeAmountTwo, [firstContract], [stakeAmountTwo], { from: memberTwo });

    // Generate and process a reward
    const reward = ether('4');
    await staking.pushReward(firstContract, reward, { from: internalContract });
    await staking.processPendingActions();

    // MemberOne can withdraw: 4 * 10 / 30 = 1.(33)
    const expectedRewardMemberOne = reward.mul(stakeAmountOne).div(ether('30'));
    const rewardMemberOne = await staking.stakerReward(memberOne);
    assert(
      rewardMemberOne.eq(expectedRewardMemberOne),
      `expected reward for member one is ${expectedRewardMemberOne}, found ${rewardMemberOne}`,
    );
    await expectRevert(
      staking.withdrawReward(memberOne, ether('2'), { from: memberOne }),
      'Requested amount exceeds available reward',
    );
    await staking.withdrawReward(memberOne, expectedRewardMemberOne, { from: memberOne });

    // MemberTwo can withdraw: 4 * 20 / 30 = 2.(66)
    const expectedRewardMemberTwo = reward.mul(stakeAmountTwo).div(ether('30'));
    const rewardMemberTwo = await staking.stakerReward(memberTwo);
    assert(
      rewardMemberTwo.eq(expectedRewardMemberTwo),
      `expected reward for member one is ${expectedRewardMemberTwo}, found ${rewardMemberTwo}`,
    );

    await expectRevert(
      staking.withdrawReward(memberTwo, ether('3'), { from: memberTwo }),
      'Requested amount exceeds available reward',
    );

    await staking.withdrawReward(memberTwo, expectedRewardMemberTwo, { from: memberTwo });
  });

  it('should properly move tokens from the PooledStaking contract to the member\'s address', async function () {
    const { token, staking } = this;

    // Fund account and stake
    const stakeAmount = ether('10');
    await fundAndApprove(token, staking, stakeAmount, memberOne);
    await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // Generate reward and process it
    const reward = ether('2');
    await staking.pushReward(firstContract, reward, { from: internalContract });
    await staking.processPendingActions();

    // Check balances
    const contractBalanceBefore = await token.balanceOf(staking.address);
    const expectedContractBalanceBefore = stakeAmount.add(reward);
    const userBalanceBefore = await token.balanceOf(memberOne);

    assert(
      contractBalanceBefore.eq(expectedContractBalanceBefore),
      `staking contract balance is ${contractBalanceBefore}, but should be ${expectedContractBalanceBefore}`,
    );

    await staking.withdrawReward(memberOne, reward, { from: memberOne });

    const contractBalanceAfter = await token.balanceOf(staking.address);
    const expectedContractBalanceAfter = stakeAmount;

    const userBalanceAfter = await token.balanceOf(memberOne);
    const expectedUserBalanceAfter = userBalanceBefore.add(reward);

    assert(
      contractBalanceAfter.eq(expectedContractBalanceAfter),
      `staking contract balance is ${contractBalanceAfter}, but should be ${expectedContractBalanceAfter}`,
    );

    assert(
      userBalanceAfter.eq(expectedUserBalanceAfter),
      `user balance is ${userBalanceAfter}, but should be ${expectedUserBalanceAfter}}`,
    );
  });

  it('should update the total left reward amount for the caller ', async function () {
    const { token, staking } = this;

    // Fund account and stake
    const stakeAmount = ether('10');
    await fundAndApprove(token, staking, stakeAmount, memberOne);
    await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // Generate reward and process it
    const reward = ether('5');
    await staking.pushReward(firstContract, reward, { from: internalContract });
    await staking.processPendingActions();

    // Withdraw partial reward
    await staking.withdrawReward(memberOne, ether('2'), { from: memberOne });

    // Expect new staker's reward to be ether('3)
    const leftReward = await staking.stakerReward(memberOne);
    assert(leftReward.eq(ether('3')));

    // Withdraw all left reward
    await staking.withdrawReward(memberOne, ether('3'), { from: memberOne });

    // Expect new staker's update to be 0
    const finalReward = await staking.stakerReward(memberOne);
    assert(finalReward.eq(ether('0')));
  });

});
