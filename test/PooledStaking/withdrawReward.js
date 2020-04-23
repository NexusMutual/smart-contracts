const { expectRevert, ether } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';

async function fundAndApprove (token, staking, amount, member) {
  const maxLeverage = '2';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
}

describe('withdrawReward', function () {

  beforeEach(setup);

  it('should revert when called by non members', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isMember(nonMember), false);

    await expectRevert(
      staking.withdrawReward(ether('1'), { from: nonMember }),
      'Caller is not a member',
    );
  });

  // TODO: Split this test in smaller tests as it currently does too many things
  it('should revert if requested amount exceeds available reward', async function () {
    const { token, staking } = this;
    const initialReward = ether('0');

    const { reward: actualInitialReward } = await staking.stakers(memberOne, { from: memberOne });

    // No rewards available
    assert(actualInitialReward.eq(initialReward));

    await expectRevert(
      staking.withdrawReward(ether('1'), { from: memberOne }),
      'Requested withdraw amount exceeds available reward',
    );

    const balanceBeforeStaking = await token.balanceOf(staking.address);
    assert(balanceBeforeStaking.eq(initialReward), 'Initial contract balance should be 0');

    // Two members stake
    const stakeAmountOne = ether('10');
    await fundAndApprove(token, staking, stakeAmountOne, memberOne);
    await staking.stake(stakeAmountOne, [firstContract], [stakeAmountOne], { from: memberOne });

    const stakeAmountTwo = ether('20');
    await fundAndApprove(token, staking, stakeAmountTwo, memberTwo);
    await staking.stake(stakeAmountTwo, [firstContract], [stakeAmountTwo], { from: memberTwo });

    const balanceAfterStaking = await token.balanceOf(staking.address);
    assert(balanceAfterStaking.eq(ether('30')), 'Balance should be equal to staked amount');

    // Generate and process rewards
    const reward = ether('3');
    await staking.pushReward(firstContract, reward, { from: internalContract });

    const balanceAfterReward = await token.balanceOf(staking.address);
    assert(balanceAfterReward.eq(ether('33')), 'Tokens should have been minted when pushing the reward');

    await staking.processPendingActions();

    await expectRevert(
      staking.withdrawReward(ether('2'), { from: memberOne }),
      'Requested withdraw amount exceeds available reward',
    );

    await expectRevert(
      staking.withdrawReward(ether('4'), { from: memberTwo }),
      'Requested withdraw amount exceeds available reward',
    );

    await staking.withdrawReward(ether('1'), { from: memberOne });
    const memberOneBalance = await token.balanceOf(memberOne);
    assert(memberOneBalance.eq(ether('1')), 'Balance of member one should have increased with withdrawn amount');

    await staking.withdrawReward(ether('2'), { from: memberTwo });
    const memberTwoBalance = await token.balanceOf(memberTwo);
    assert(memberTwoBalance.eq(ether('2')), 'Balance of member two should have increased with withdrawn amount');

    const balanceAfterWithdraw = await token.balanceOf(staking.address);
    assert(balanceAfterWithdraw.eq(ether('30')), 'Tokens should have been subtracted from the contract');

    await expectRevert(
      staking.withdrawReward('1', { from: memberOne }),
      'Requested withdraw amount exceeds available reward.',
    );

    await expectRevert(
      staking.withdrawReward('1', { from: memberTwo }),
      'Requested withdraw amount exceeds available reward.',
    );
  });

  it('should properly move tokens from the PooledStaking contract to the member\'s address', async function () {
    const { token, staking } = this;

    // Fund account adn stake
    const stakeAmount = ether('10');
    await fundAndApprove(token, staking, stakeAmount, memberOne);
    await staking.stake(stakeAmount, [firstContract], [stakeAmount], { from: memberOne });

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

    await staking.withdrawReward(reward, { from: memberOne });

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

});
