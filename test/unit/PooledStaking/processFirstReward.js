const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const {
  accounts,
  constants: { StakingUintParamType, Role },
} = require('../utils');

const {
  members: [memberOne, memberTwo, memberThree],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundApproveDepositStake(token, tokenController, staking, amount, contract, member) {
  await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

describe('processFirstReward', function () {
  it('should mint the reward amount in the PS contract', async function () {
    const { token, tokenController, staking } = this;
    const roundDuration = await staking.REWARD_ROUND_DURATION();

    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    await staking.accumulateReward(firstContract, ether('2'), { from: internalContract });
    await time.increase(roundDuration);
    await staking.pushRewards([firstContract]);
    await staking.processPendingActions('100');

    const currentBalance = await token.balanceOf(staking.address);
    const expectedBalance = ether('12');
    assert(
      currentBalance.eq(expectedBalance),
      `Expected balance of staking contract ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should mint the reward amount in the PS contract when processing in batches', async function () {
    const { token, tokenController, staking } = this;

    const stakeMemberOne = ether('10');
    const stakeMemberTwo = ether('20');

    await fundApproveDepositStake(token, tokenController, staking, stakeMemberOne, firstContract, memberOne);
    await fundApproveDepositStake(token, tokenController, staking, stakeMemberTwo, firstContract, memberTwo);

    const initialContractBalance = await token.balanceOf(staking.address);
    const expectedInitialContractBalance = ether('30');
    assert(
      initialContractBalance.eq(expectedInitialContractBalance),
      `expected initial contract balance to be ${expectedInitialContractBalance}, found ${initialContractBalance}`,
    );

    // push reward and process in batches
    await staking.accumulateReward(firstContract, ether('3'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    await staking.processPendingActions('3');
    assert.equal(await staking.hasPendingActions(), true, 'should have not finished processing all pending actions');
    await staking.processPendingActions('1');
    assert.equal(await staking.hasPendingActions(), false, 'should have finished processing all pending actions');

    // push reward and process it
    await staking.accumulateReward(firstContract, ether('3'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    await staking.processPendingActions('4');
    assert.equal(await staking.hasPendingActions(), false, 'should have finished processing all pending actions');

    const finalContractBalance = await token.balanceOf(staking.address);
    const expectedFinalContractBalance = ether('36');
    assert(
      finalContractBalance.eq(expectedFinalContractBalance),
      `expected final contract balance to be ${expectedFinalContractBalance}, found ${finalContractBalance}`,
    );
  });

  it('should reward stakers proportionally to their stake', async function () {
    const { token, tokenController, staking } = this;

    await staking.accumulateReward(firstContract, ether('20'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    await expectRevert(
      fundApproveDepositStake(token, tokenController, staking, ether('100'), firstContract, memberOne),
      'Unable to execute request with unprocessed actions',
    );

    await time.advanceBlock();
    await staking.processPendingActions('100');

    await fundApproveDepositStake(token, tokenController, staking, ether('100'), firstContract, memberOne);
    await fundApproveDepositStake(token, tokenController, staking, ether('180'), firstContract, memberTwo);
    await fundApproveDepositStake(token, tokenController, staking, ether('230'), firstContract, memberThree);

    await staking.accumulateReward(firstContract, ether('50'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    await time.advanceBlock();
    await staking.processPendingActions('100');

    const rewardOne = await staking.stakerReward(memberOne);
    assert.equal(
      rewardOne.toString(),
      '9803921568627450980',
      `Expected rewardOne to be 9803921568627450980, found ${rewardOne}`,
    );

    const rewardTwo = await staking.stakerReward(memberTwo);
    assert.equal(
      rewardTwo.toString(),
      '17647058823529411764',
      `Expected rewardOne to be 17647058823529411764, found ${rewardTwo}`,
    );

    const rewardThree = await staking.stakerReward(memberThree);
    assert.equal(
      rewardThree.toString(),
      '22549019607843137254',
      `Expected rewardOne to be 22549019607843137254, found ${rewardThree}`,
    );
  });

  it('should reward stakers proportionally to their stake, after a burn', async function () {
    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('100'), firstContract, memberOne);
    await fundApproveDepositStake(token, tokenController, staking, ether('200'), firstContract, memberTwo);
    await fundApproveDepositStake(token, tokenController, staking, ether('300'), firstContract, memberThree);

    // Burn 200
    await time.advanceBlock();
    await staking.pushBurn(firstContract, ether('500'), { from: internalContract });
    await time.advanceBlock();
    await staking.processPendingActions('100');

    const stakeOne = await staking.stakerContractStake(memberOne, firstContract);
    assert.equal(
      stakeOne.toString(),
      '16666666666666666667',
      `Expected stakeOne to be 16666666666666666667, found ${stakeOne}`,
    );
    const stakeTwo = await staking.stakerContractStake(memberTwo, firstContract);
    assert.equal(
      stakeTwo.toString(),
      '33333333333333333334',
      `Expected stakeOne to be 33333333333333333334, found ${stakeTwo}`,
    );
    const stakeThree = await staking.stakerContractStake(memberThree, firstContract);
    assert.equal(
      stakeThree.toString(),
      '50000000000000000000',
      `Expected stakeOne to be 50000000000000000000, found ${stakeThree}`,
    );

    // Reward 50
    await time.advanceBlock();
    await staking.accumulateReward(firstContract, ether('50'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    await time.advanceBlock();
    await staking.processPendingActions('100');

    const rewardOne = await staking.stakerReward(memberOne);
    assert.equal(
      rewardOne.toString(),
      '8333333333333333333',
      `Expected rewardOne to be 8333333333333333333, found ${rewardOne}`,
    );
    const rewardTwo = await staking.stakerReward(memberTwo);
    assert.equal(
      rewardTwo.toString(),
      '16666666666666666666',
      `Expected rewardOne to be 16666666666666666666, found ${rewardTwo}`,
    );
    const rewardThree = await staking.stakerReward(memberThree);
    assert.equal(
      rewardThree.toString(),
      '24999999999999999999',
      `Expected rewardOne to be 24999999999999999999, found ${rewardThree}`,
    );
  });

  it('should reward staker correctly, after a burn on another contract', async function () {
    const { token, tokenController, staking } = this;

    // Deposit and stake
    await fundApproveDepositStake(token, tokenController, staking, ether('200'), firstContract, memberOne);
    await staking.depositAndStake(
      ether('0'),
      [firstContract, secondContract, thirdContract],
      [ether('200'), ether('50'), ether('150')],
      { from: memberOne },
    );
    await fundApproveDepositStake(token, tokenController, staking, ether('200'), thirdContract, memberTwo);

    let stakerOneDeposit = await staking.stakerDeposit(memberOne);
    assert(
      stakerOneDeposit.eq(ether('200')),
      `Expected staker one deposit before the burn to be ${ether('200')}, found ${stakerOneDeposit}`,
    );
    let stakerTwoDeposit = await staking.stakerDeposit(memberTwo);
    assert(
      stakerTwoDeposit.eq(ether('200')),
      `Expected staker two deposit after the burn to be ${ether('200')}, found ${stakerTwoDeposit}`,
    );

    // Push reward 20 on secondContract
    await staking.accumulateReward(secondContract, ether('20'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([secondContract]);
    await time.increase(60);

    // Burn 100 on firstContract
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await time.increase(60);

    // Push reward 30 on thirdContract
    await staking.accumulateReward(thirdContract, ether('30'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([thirdContract]);
    await time.increase(60);

    // Process Actions
    await staking.processPendingActions('100');
    await time.increase(60);

    stakerOneDeposit = await staking.stakerDeposit(memberOne);
    assert(
      stakerOneDeposit.eq(ether('100')),
      `Expected staker one deposit after the burn to be ${ether('100')}, found ${stakerOneDeposit}`,
    );
    stakerTwoDeposit = await staking.stakerDeposit(memberTwo);
    assert(
      stakerTwoDeposit.eq(ether('200')),
      `Expected staker two deposit after the burn to be ${ether('200')}, found ${stakerTwoDeposit}`,
    );

    // Check stakes
    const stakeOne = await staking.stakerContractStake(memberOne, firstContract);
    assert.equal(
      stakeOne.toString(),
      '100000000000000000000',
      `Expected stakeOne to be 100000000000000000000, found ${stakeOne}`,
    );
    const stakeTwo = await staking.stakerContractStake(memberOne, secondContract);
    assert.equal(
      stakeTwo.toString(),
      '50000000000000000000',
      `Expected stakeTwo to be 50000000000000000000, found ${stakeTwo}`,
    );
    const stakeThree = await staking.stakerContractStake(memberOne, thirdContract);
    assert.equal(
      stakeThree.toString(),
      '100000000000000000000',
      `Expected stakeThree to be 100000000000000000000, found ${stakeThree}`,
    );
    const stakeThreeMemberTwo = await staking.stakerContractStake(memberTwo, thirdContract);
    assert.equal(
      stakeThreeMemberTwo.toString(),
      '200000000000000000000',
      `Expected stakeThreeMemberTwo to be 200000000000000000000, found ${stakeThreeMemberTwo}`,
    );

    // Check rewards
    const reward = await staking.stakerReward(memberOne);
    assert.equal(
      reward.toString(),
      '30000000000000000000',
      `Expected reward to be 30000000000000000000, found ${reward}`,
    );

    const rewardTwo = await staking.stakerReward(memberTwo);
    assert.equal(
      rewardTwo.toString(),
      '20000000000000000000',
      `Expected reward two to be 20000000000000000000, found ${rewardTwo}`,
    );
  });

  it('should handle contracts with 0 stake', async function () {
    const { token, staking } = this;

    const preRewardBalance = await token.balanceOf(staking.address);

    await staking.accumulateReward(firstContract, ether('50'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    await time.advanceBlock();
    await staking.processPendingActions('100');

    // Expect no rewards to have been minted
    const postRewardBalance = await token.balanceOf(staking.address);
    assert(
      postRewardBalance.eq(preRewardBalance),
      `Expected post reward balance of staking contract ${preRewardBalance}, found ${postRewardBalance}`,
    );
  });

  it('should delete the item from the rewards mapping after processing it', async function () {
    const { token, tokenController, staking } = this;

    await fundApproveDepositStake(token, tokenController, staking, ether('300'), firstContract, memberOne);
    await staking.accumulateReward(firstContract, ether('10'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    let hasPendingRewards = await staking.hasPendingRewards();
    assert.isTrue(hasPendingRewards, 'Expect hasPendingRewards to be true');

    const tx = await staking.processPendingActions('100');
    expectEvent(tx, 'PendingActionsProcessed', { finished: true });

    hasPendingRewards = await staking.hasPendingRewards();
    assert.isFalse(hasPendingRewards, 'Expect hasPendingRewards to be false');
  });

  it('should do up to maxIterations and finish in stakers.length * 2 cycles', async function () {
    const { token, tokenController, master, staking, memberRoles } = this;
    const iterationsNeeded = accounts.generalPurpose.length * 2;

    for (const account of accounts.generalPurpose) {
      await master.enrollMember(account, Role.Member);
      await memberRoles.setRole(account, Role.Member);
      await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, account);
    }

    await staking.accumulateReward(firstContract, ether('2'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);

    let process = await staking.processPendingActions(`${iterationsNeeded - 1}`);
    expectEvent(process, 'PendingActionsProcessed', { finished: false });

    // finish processing
    process = await staking.processPendingActions('1');
    expectEvent(process, 'PendingActionsProcessed', { finished: true });

    const processedToStakerIndex = await staking.processedToStakerIndex();
    assert(processedToStakerIndex.eqn(0), `Expected processedToStakerIndex to be 0, found ${processedToStakerIndex}`);
  });

  it('should remove and re-add 0-account stakers', async function () {
    const { token, tokenController, staking } = this;

    await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });

    const stakes = {
      [memberOne]: {
        amount: '10',
        on: [firstContract, secondContract, thirdContract],
        amounts: ['10', '10', '10'],
      },
      [memberTwo]: { amount: '20', on: [secondContract, thirdContract], amounts: ['20', '20'] },
      [memberThree]: { amount: '30', on: [firstContract, thirdContract], amounts: ['30', '30'] },
    };

    for (const member in stakes) {
      const stake = stakes[member];
      await token.transfer(member, ether(stake.amount));
      await token.approve(tokenController.address, ether(stake.amount), { from: member });
      await staking.depositAndStake(ether(stake.amount), stake.on, stake.amounts.map(ether), { from: member });
    }

    const expectedFirstContractStake = ether('40');
    const actualFirstContractStake = await staking.contractStake(firstContract);
    assert(
      expectedFirstContractStake.eq(actualFirstContractStake),
      `firstContract stake should be ${expectedFirstContractStake} but found ${actualFirstContractStake}`,
    );

    const initialStakers = await staking.contractStakersArray(firstContract);
    const expectedInitialStakers = [memberOne, memberThree];
    assert.deepEqual(
      initialStakers,
      expectedInitialStakers,
      `expected initial stakers to be "${expectedInitialStakers.join(',')}" but found "${initialStakers.join(',')}"`,
    );

    // burn everything on the first contract
    await staking.pushBurn(firstContract, ether('40'), { from: internalContract });
    await staking.processPendingActions('100');

    const firstContractStake = await staking.contractStake(firstContract);
    assert(ether('0').eq(firstContractStake), `firstContract stake should be 0 but found ${firstContractStake}`);

    const secondTestStakers = await staking.contractStakersArray(firstContract);
    const expectedSecondTestStakers = [];
    assert.deepEqual(
      secondTestStakers,
      expectedSecondTestStakers,
      `expected initial stakers to be "${expectedSecondTestStakers.join(',')}" but found "${secondTestStakers.join(
        ',',
      )}"`,
    );

    // push a small reward on secondContract and expect firstStaker to be removed
    await staking.accumulateReward(secondContract, ether('1'), { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([secondContract]);
    await staking.processPendingActions('100');

    const finalStakers = await staking.contractStakersArray(secondContract);
    const finalExpectedStakers = [memberTwo];
    assert.deepEqual(
      finalStakers,
      finalExpectedStakers,
      `expected initial stakers to be "${finalStakers.join(',')}" but found "${finalStakers.join(',')}"`,
    );

    await token.transfer(memberOne, ether('5'));
    await token.approve(tokenController.address, ether('5'), { from: memberOne });
    await staking.depositAndStake(
      ether('5'),
      [firstContract, secondContract, thirdContract],
      [0, ether('5'), ether('5')],
      { from: memberOne },
    );

    const newStakers = await staking.contractStakersArray(secondContract);
    const newExpectedStakers = [memberTwo, memberOne];
    assert.deepEqual(
      newStakers,
      newExpectedStakers,
      `expected initial stakers to be "${newExpectedStakers.join(',')}" but found "${newStakers.join(',')}"`,
    );
  });

  it('should emit Rewarded event', async function () {
    const { token, tokenController, staking } = this;
    await fundApproveDepositStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    const rewardAmount = ether('2');
    await staking.accumulateReward(firstContract, rewardAmount, { from: internalContract });
    await time.increase(await staking.REWARD_ROUND_DURATION());
    await staking.pushRewards([firstContract]);
    const process = await staking.processPendingActions('100');

    expectEvent(process, 'Rewarded', {
      contractAddress: firstContract,
      amount: rewardAmount,
    });
  });
});
