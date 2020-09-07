const { ether, expectEvent, time } = require('@openzeppelin/test-helpers');
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

async function fundAndApprove (token, tokenController, staking, amount, member) {
  const maxExposure = '2';
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, maxExposure, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
}

describe('withdrawReward', function () {

  beforeEach(setup);

  it("should properly move tokens from the PooledStaking contract to the member's address", async function () {
    const { token, tokenController, staking } = this;

    // Fund account and stake
    const stakeAmount = ether('10');
    await fundAndApprove(token, tokenController, staking, stakeAmount, memberOne);
    await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // Generate reward and process it
    const roundDuration = await staking.REWARD_ROUND_DURATION();
    const reward = ether('2');

    await staking.accumulateReward(firstContract, reward, { from: internalContract });
    await time.increase(roundDuration);
    await staking.pushRewards([firstContract]);
    await staking.processPendingActions('100');

    // Check balances
    const contractBalanceBefore = await token.balanceOf(staking.address);
    const expectedContractBalanceBefore = stakeAmount.add(reward);
    const userBalanceBefore = await token.balanceOf(memberOne);

    assert(
      contractBalanceBefore.eq(expectedContractBalanceBefore),
      `staking contract balance is ${contractBalanceBefore}, but should be ${expectedContractBalanceBefore}`,
    );

    await staking.withdrawReward(memberOne, { from: nonMember });

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

  it('should check left reward is 0 after withdrawl and emit RewardWithdrawn', async function () {
    const { token, tokenController, staking } = this;

    // Fund account and stake
    const stakeAmount = ether('10');
    await fundAndApprove(token, tokenController, staking, stakeAmount, memberOne);
    await staking.depositAndStake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

    // Generate reward and process it
    const roundDuration = await staking.REWARD_ROUND_DURATION();
    const reward = ether('5');

    await staking.accumulateReward(firstContract, reward, { from: internalContract });
    await time.increase(roundDuration);
    await staking.pushRewards([firstContract]);
    await staking.processPendingActions('100');

    // Withdraw all left reward
    const tx = await staking.withdrawReward(memberOne, { from: nonMember });
    expectEvent(tx, 'RewardWithdrawn', { staker: memberOne, amount: reward });

    // Expect new reward of staker to be 0
    const finalReward = await staking.stakerReward(memberOne);
    assert(finalReward.eq(ether('0')));
  });

});
