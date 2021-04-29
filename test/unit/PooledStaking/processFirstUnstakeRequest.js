const { ether, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const { accounts, constants } = require('../utils');
const { StakingUintParamType } = constants;

const {
  members: [memberOne],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';

async function fundAndStake (token, tokenController, staking, amount, contract, member) {
  await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

async function setMinAllowedUnstake (staking, amount) {
  return staking.updateUintParameters(StakingUintParamType.MIN_UNSTAKE, amount, { from: governanceContract });
}

async function setUnstakeLockTime (staking, lockTime) {
  return staking.updateUintParameters(StakingUintParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('processUnstakeRequest', function () {

  it('should have no pending actions after processing the unstake requests', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake request
    const firstRequest = ether('3');
    await staking.requestUnstake([firstContract], [firstRequest], 0, { from: memberOne });

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);

    let hasPendingActions = await staking.hasPendingActions();
    assert.isTrue(hasPendingActions, 'Expected pending actions');

    let processPendingActions = await staking.processPendingActions('100');
    expectEvent(processPendingActions, 'PendingActionsProcessed', { finished: true });

    hasPendingActions = await staking.hasPendingActions();
    assert.isFalse(hasPendingActions, 'Expected no more pending actions');

    // Request multiple unstake requests in a row
    for (let i = 0; i < 30; i++) {
      const lastUnstakeRequestId = await staking.lastUnstakeRequestId();
      const { next: nextId } = await staking.unstakeRequestAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastUnstakeRequestId;
      await staking.requestUnstake([firstContract], [ether('3')], insertAfter, { from: memberOne });
    }

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);

    processPendingActions = await staking.processPendingActions('100');
    expectEvent(processPendingActions, 'PendingActionsProcessed', {
      finished: true,
    });

    hasPendingActions = await staking.hasPendingActions();
    assert.isFalse(hasPendingActions, 'Expected no more pending actions');
  });

  it('should update staker.stakerContractPendingUnstakeTotal correctly', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake request
    const firstRequest = ether('3');
    await staking.requestUnstake([firstContract], [firstRequest], 0, { from: memberOne });

    let pendingUnstakeTotal = await staking.stakerContractPendingUnstakeTotal(memberOne, firstContract);
    assert(
      pendingUnstakeTotal.eq(ether('3')),
      `Expected staker's pendingUnstakeTotal to be ${ether('3')},  found ${pendingUnstakeTotal}`,
    );

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);
    await staking.processPendingActions('100');

    // Expect staker.stakerContractPendingUnstakeTotal = 0
    pendingUnstakeTotal = await staking.stakerContractPendingUnstakeTotal(memberOne, firstContract);
    assert(
      pendingUnstakeTotal.eq(ether('0')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('0')},  found ${pendingUnstakeTotal}`,
    );

    // Request multiple unstake requests in a row
    for (let i = 0; i < 30; i++) {
      const lastUnstakeRequestId = await staking.lastUnstakeRequestId();
      const { next: nextId } = await staking.unstakeRequestAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastUnstakeRequestId;
      await staking.requestUnstake([firstContract], [ether('3')], insertAfter, { from: memberOne });
    }

    await time.increase(91 * 24 * 3600);

    // Expect staker.stakerContractPendingUnstakeTotal = 90
    pendingUnstakeTotal = await staking.stakerContractPendingUnstakeTotal(memberOne, firstContract);
    assert(
      pendingUnstakeTotal.eq(ether('90')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('00')},  found ${pendingUnstakeTotal}`,
    );

    // Process actions
    await staking.processPendingActions('100');

    // Expect staker.stakerContractPendingUnstakeTotal = 0
    pendingUnstakeTotal = await staking.stakerContractPendingUnstakeTotal(memberOne, firstContract);
    assert(
      pendingUnstakeTotal.eq(ether('0')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('0')},  found ${pendingUnstakeTotal}`,
    );
  });

  it('should update stakes correctly', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake request
    await staking.requestUnstake([firstContract], [ether('10')], 0, { from: memberOne });

    let stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('100')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('100')},  found ${stake}`,
    );

    // Process pending actions after 91 days
    await time.increase(91 * 24 * 3600);
    await staking.processPendingActions('100');

    // Expect stake = 0
    stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('90')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('90')},  found ${stake}`,
    );

    // Request multiple unstake requests in a row
    for (let i = 0; i < 30; i++) {
      const lastUnstakeRequestId = await staking.lastUnstakeRequestId();
      const { next: nextId } = await staking.unstakeRequestAtIndex(0);
      const insertAfter = nextId.eqn(0) ? 0 : lastUnstakeRequestId;
      await staking.requestUnstake([firstContract], [ether('2')], insertAfter, { from: memberOne });
    }

    await time.increase(91 * 24 * 3600);

    // Expect stake = 90
    stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('90')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('00')},  found ${stake}`,
    );

    // Process actions
    await staking.processPendingActions('100');

    // Expect stake = 0
    stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('30')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('30')},  found ${stake}`,
    );
  });

  it('should update the next pointer of the first unstake request', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake requests
    await staking.requestUnstake([firstContract], [ether('30')], 0, { from: memberOne });

    await time.increase(10 * 24 * 3600); // 10 days
    await staking.requestUnstake([firstContract], [ether('10')], 1, { from: memberOne });
    await staking.requestUnstake([firstContract], [ether('20')], 2, { from: memberOne });

    await time.increase(81 * 24 * 3600);
    await staking.processPendingActions('100');
    const { next: firstNext } = await staking.unstakeRequestAtIndex(0);
    assert(firstNext.eqn(2));

    await time.increase(10 * 24 * 3600);
    await staking.processPendingActions('100');
    const { next: secondNext } = await staking.unstakeRequestAtIndex(0);
    assert(secondNext.eqn(0));
  });

  it('should only unstake available amount if a burn occurs after requesting, but before processing', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake request
    const firstRequest = ether('70');
    await staking.requestUnstake([firstContract], [firstRequest], 0, { from: memberOne });

    // Push and process burn
    await time.increase(10 * 24 * 3600);
    await staking.pushBurn(firstContract, ether('90'), { from: internalContract });
    await staking.processPendingActions('100');

    // Expect staker.stakerContractPendingUnstakeTotal = 70, even if the actual stake is 10
    const pendingUnstakeTotal = await staking.stakerContractPendingUnstakeTotal(memberOne, firstContract);
    assert(
      pendingUnstakeTotal.eq(ether('70')),
      `Expected staker.stakerContractPendingUnstakeTotal to be ${ether('70')},  found ${pendingUnstakeTotal}`,
    );
    let stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('10')),
      `Expected stake to be ${ether('10')}, found ${stake}`,
    );

    await time.increase(81 * 24 * 3600);
    await staking.processPendingActions('100');

    // Only unstake the remaining stake (10), although originally requested 70
    stake = await staking.stakerContractStake(memberOne, firstContract);
    assert(
      stake.eq(ether('0')),
      `Expected stake to be ${ether('0')}, found ${stake}`,
    );
  });

  it('should emit Unstaked event', async function () {

    const { token, tokenController, staking } = this;

    // Fund account and stake 100
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);

    // Set parameters
    await setMinAllowedUnstake(staking, ether('1'));
    await setUnstakeLockTime(staking, 90 * 24 * 3600); // 90 days

    // create unstake requests
    await staking.requestUnstake([firstContract], [ether('30')], 0, { from: memberOne });

    await time.increase(91 * 24 * 3600); // 91 days

    const process = await staking.processPendingActions('100');
    expectEvent(process, 'Unstaked', {
      contractAddress: firstContract,
      staker: memberOne,
      amount: ether('30'),
    });
  });
});
