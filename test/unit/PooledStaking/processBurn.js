const { ether, expectEvent } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { StakingUintParamType, Role } = require('../utils').constants;

const {
  members: [memberOne, memberTwo, memberThree],
  internalContracts: [internalContract],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndStake(token, tokenController, staking, amount, contract, member) {
  await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(tokenController.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

async function setLockTime(staking, lockTime) {
  return staking.updateUintParameters(StakingUintParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('processBurn', function () {
  it('should update staker deposit & stake correctly', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const initialStake = ether('10');
    await fundAndStake(token, tokenController, staking, initialStake, firstContract, memberOne);

    // Burn 3
    await staking.pushBurn(firstContract, ether('3'), { from: internalContract });
    await staking.processPendingActions('100');

    // Expect staker deposit to be 7
    let newDeposit = await staking.stakerDeposit(memberOne);
    assert(newDeposit.eq(ether('7')), `Expected new deposit to be ${ether('7')}, found ${newDeposit}`);
    let newStake = await staking.stakerContractStake(memberOne, firstContract);
    assert(newStake.eq(ether('7')), `Expected new deposit to be ${ether('7')}, found ${newStake}`);

    // Burn 9
    await staking.pushBurn(firstContract, ether('9'), { from: internalContract });
    await staking.processPendingActions('100');

    // Expect staker deposit to be 0
    newDeposit = await staking.stakerDeposit(memberOne);
    assert(newDeposit.eq(ether('0')), `Expected new deposit to be ${ether('0')}, found ${newDeposit}`);
    newStake = await staking.stakerContractStake(memberOne, firstContract);
    assert(newStake.eq(ether('0')), `Expected new deposit to be ${ether('0')}, found ${newStake}`);
  });

  it('should update staker deposit & stake correctly for multiple stakers', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Multiple stakers
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);
    await fundAndStake(token, tokenController, staking, ether('200'), firstContract, memberTwo);
    await fundAndStake(token, tokenController, staking, ether('300'), firstContract, memberThree);

    await staking.pushBurn(firstContract, ether('90'), { from: internalContract });
    await staking.processPendingActions('100');

    const newDepositOne = await staking.stakerDeposit(memberOne);
    assert(newDepositOne.eq(ether('85')), `Expected new deposit one to be ${ether('85')}, found ${newDepositOne}`);
    const newStakeOne = await staking.stakerContractStake(memberOne, firstContract);
    assert(newStakeOne.eq(ether('85')), `Expected new stake one to be ${ether('85')}, found ${newStakeOne}`);

    const newDepositTwo = await staking.stakerDeposit(memberTwo);
    assert(newDepositTwo.eq(ether('170')), `Expected new deposit two to be ${ether('170')}, found ${newDepositTwo}`);
    const newStakeTwo = await staking.stakerContractStake(memberTwo, firstContract);
    assert(newStakeTwo.eq(ether('170')), `Expected new stake two to be ${ether('170')}, found ${newStakeTwo}`);

    const newDepositThree = await staking.stakerDeposit(memberThree);
    assert(
      newDepositThree.eq(ether('255')),
      `Expected new deposit three to be ${ether('255')}, found ${newDepositThree}`,
    );
    const newStakeThree = await staking.stakerContractStake(memberThree, firstContract);
    assert(newStakeThree.eq(ether('255')), `Expected new stake three to be ${ether('255')}, found ${newStakeThree}`);
  });

  it('should update deposit & stake for multiple stakers when contract stake < burn amount', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Multiple stakers
    await fundAndStake(token, tokenController, staking, ether('100'), firstContract, memberOne);
    await fundAndStake(token, tokenController, staking, ether('200'), firstContract, memberTwo);
    await fundAndStake(token, tokenController, staking, ether('300'), firstContract, memberThree);

    await staking.pushBurn(firstContract, ether('700'), { from: internalContract });
    await staking.processPendingActions('100');

    const newDepositOne = await staking.stakerDeposit(memberOne);
    assert(newDepositOne.eq(ether('0')), `Expected new deposit one to be ${ether('0')}, found ${newDepositOne}`);
    const newStakeOne = await staking.stakerContractStake(memberOne, firstContract);
    assert(newStakeOne.eq(ether('0')), `Expected new stake one to be ${ether('0')}, found ${newStakeOne}`);

    const newDepositTwo = await staking.stakerDeposit(memberTwo);
    assert(newDepositTwo.eq(ether('0')), `Expected new deposit two to be ${ether('0')}, found ${newDepositTwo}`);
    const newStakeTwo = await staking.stakerContractStake(memberTwo, firstContract);
    assert(newStakeTwo.eq(ether('0')), `Expected new stake two to be ${ether('0')}, found ${newStakeTwo}`);

    const newDepositThree = await staking.stakerDeposit(memberThree);
    assert(newDepositThree.eq(ether('0')), `Expected new deposit three to be ${ether('0')}, found ${newDepositThree}`);
    const newStakeThree = await staking.stakerContractStake(memberThree, firstContract);
    assert(newStakeThree.eq(ether('0')), `Expected new stake three to be ${ether('0')}, found ${newStakeThree}`);
  });

  it('should process burn when staked amount on contract is 0', async function () {
    const { staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await staking.pushBurn(firstContract, ether('30'), { from: internalContract });
    await staking.processPendingActions('100');
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

    // push a small burn on secondContract and expect firstStaker to be "removed
    await staking.pushBurn(secondContract, ether('1'), { from: internalContract });
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

  it('should remove stakers when burning 0-deposit stakers', async function () {
    const { token, tokenController, staking } = this;
    await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });

    const stakes = {
      [memberOne]: { amount: '100', on: [firstContract, secondContract], amounts: ['100', '100'] },
      [memberTwo]: { amount: '100', on: [firstContract, secondContract], amounts: ['50', '100'] },
    };

    for (const member in stakes) {
      const stake = stakes[member];
      await token.transfer(member, ether(stake.amount));
      await token.approve(tokenController.address, ether(stake.amount), { from: member });
      await staking.depositAndStake(ether(stake.amount), stake.on, stake.amounts.map(ether), { from: member });
    }

    // push 200 burn (which should actually burn 150)
    await staking.pushBurn(firstContract, ether('200'), { from: internalContract });
    await staking.processPendingActions('100');

    // check stakes
    let actualStake = await staking.contractStake(firstContract);
    let expectedStake = ether('0');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    actualStake = await staking.contractStake(secondContract);
    expectedStake = ether('50');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    // check stakers
    let actualStakers = await staking.contractStakersArray(firstContract);
    let expectedStakers = [];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    actualStakers = await staking.contractStakersArray(secondContract);
    expectedStakers = [memberOne, memberTwo];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    // push 10 burn
    await staking.pushBurn(secondContract, ether('10'), { from: internalContract });
    await staking.processPendingActions('100');

    // check stakes
    actualStake = await staking.contractStake(firstContract);
    expectedStake = ether('0');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    actualStake = await staking.contractStake(secondContract);
    expectedStake = ether('40');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    // check stakers
    actualStakers = await staking.contractStakersArray(firstContract);
    expectedStakers = [];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    actualStakers = await staking.contractStakersArray(secondContract);
    expectedStakers = [memberTwo];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    await token.transfer(memberOne, ether('100'));
    await token.approve(tokenController.address, ether('100'), { from: memberOne });
    await staking.depositAndStake(ether('100'), [firstContract, secondContract], ['0', ether('100')], {
      from: memberOne,
    });

    actualStakers = await staking.contractStakersArray(firstContract);
    expectedStakers = [];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    actualStakers = await staking.contractStakersArray(secondContract);
    expectedStakers = [memberTwo, memberOne];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );
  });

  it('should not add duplicate stakers when staking on non-zero stake but zero deposit', async function () {
    const { token, tokenController, staking } = this;
    await staking.updateUintParameters(StakingUintParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });

    const stakes = {
      [memberOne]: { amount: '100', on: [firstContract, secondContract], amounts: ['100', '100'] },
      [memberTwo]: { amount: '100', on: [firstContract, secondContract], amounts: ['50', '100'] },
    };

    for (const member in stakes) {
      const stake = stakes[member];
      await token.transfer(member, ether(stake.amount));
      await token.approve(tokenController.address, ether(stake.amount), { from: member });
      await staking.depositAndStake(ether(stake.amount), stake.on, stake.amounts.map(ether), { from: member });
    }

    // push 200 burn (which should actually burn 150)
    await staking.pushBurn(firstContract, ether('200'), { from: internalContract });
    await staking.processPendingActions('100');

    // check stakes
    let actualStake = await staking.contractStake(firstContract);
    let expectedStake = ether('0');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    actualStake = await staking.contractStake(secondContract);
    expectedStake = ether('50');
    assert(expectedStake.eq(actualStake), `Expected ${expectedStake} staked but found ${actualStake}`);

    // check stakers
    let actualStakers = await staking.contractStakersArray(firstContract);
    let expectedStakers = [];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    actualStakers = await staking.contractStakersArray(secondContract);
    expectedStakers = [memberOne, memberTwo];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    await token.transfer(memberOne, ether('100'));
    await token.approve(tokenController.address, ether('100'), { from: memberOne });
    await staking.depositAndStake(ether('100'), [firstContract, secondContract], ['0', ether('100')], {
      from: memberOne,
    });

    actualStakers = await staking.contractStakersArray(firstContract);
    expectedStakers = [];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );

    actualStakers = await staking.contractStakersArray(secondContract);
    expectedStakers = [memberOne, memberTwo];
    assert.deepEqual(
      actualStakers,
      expectedStakers,
      `Expected stakers [${expectedStakers.join(',')}] but found [${actualStakers.join(',')}]`,
    );
  });

  it('should burn the correct amount of tokens', async function () {
    const { token, tokenController, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const stakeAmount = ether('10');
    await fundAndStake(token, tokenController, staking, stakeAmount, firstContract, memberOne);

    // Push a burn of 6
    const burnAmount = ether('6');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });
    await staking.processPendingActions('100');

    const expectedBalance = stakeAmount.sub(burnAmount);
    const currentBalance = await token.balanceOf(staking.address);
    assert(
      currentBalance.eq(expectedBalance),
      `staking contract balance should be ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should burn the correct amount of tokens when processing in batches', async function () {
    const { token, tokenController, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10 and 20
    const stakeAmountOne = ether('10');
    const stakeAmountTwo = ether('20');

    await fundAndStake(token, tokenController, staking, stakeAmountOne, firstContract, memberOne);
    await fundAndStake(token, tokenController, staking, stakeAmountTwo, firstContract, memberTwo);

    const initialContractBalance = await token.balanceOf(staking.address);
    const expectedInitialContractBalance = ether('30');
    assert(
      initialContractBalance.eq(expectedInitialContractBalance),
      `expected initial contract balance to be ${expectedInitialContractBalance}, found ${initialContractBalance}`,
    );

    // Push a burn of 3
    const burnAmountOne = ether('3');
    await staking.pushBurn(firstContract, burnAmountOne, { from: internalContract });

    // Process in batches
    await staking.processPendingActions('3');
    assert.equal(await staking.hasPendingActions(), true, 'should have not finished processing all pending actions');

    await staking.processPendingActions('1');
    assert.equal(await staking.hasPendingActions(), false, 'should have finished processing all pending actions');

    // Push another burn of 3
    const burnAmountTwo = ether('3');
    await staking.pushBurn(firstContract, burnAmountTwo, { from: internalContract });

    // Process second burn
    await staking.processPendingActions('4');
    assert.equal(await staking.hasPendingActions(), false, 'should have finished processing all pending actions');

    const finalContractBalance = await token.balanceOf(staking.address);
    const expectedFinalContractBalance = ether('24');
    assert(
      finalContractBalance.eq(expectedFinalContractBalance),
      `expected final contract balance to be ${expectedFinalContractBalance}, found ${finalContractBalance}`,
    );

    const totalBurn = ether('6');
    const totalStake = ether('30');

    const burnAmountMemberOne = totalBurn.mul(stakeAmountOne).div(totalStake);
    const burnAmountMemberTwo = totalBurn.mul(stakeAmountTwo).div(totalStake);

    const expectedDepositOne = stakeAmountOne.sub(burnAmountMemberOne);
    const currentDepositOne = await staking.stakerDeposit(memberOne);
    assert(
      currentDepositOne.eq(expectedDepositOne),
      `member one deposit should be ${expectedDepositOne}, found ${currentDepositOne}`,
    );

    const expectedDepositTwo = stakeAmountTwo.sub(burnAmountMemberTwo);
    const currentDepositTwo = await staking.stakerDeposit(memberTwo);
    assert(
      currentDepositTwo.eq(expectedDepositTwo),
      `member two deposit should be ${expectedDepositTwo}, found ${currentDepositTwo}`,
    );
  });

  it('should burn up to contract stake if requested a bigger burn than available', async function () {
    const { token, tokenController, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const stakeAmount = ether('10');
    await fundAndStake(token, tokenController, staking, stakeAmount, firstContract, memberOne);

    // Push a burn of 100
    const burnAmount = ether('100');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });
    await staking.processPendingActions('100');

    const expectedBalance = ether('0');
    const currentBalance = await token.balanceOf(staking.address);
    assert(
      currentBalance.eq(expectedBalance),
      `staking contract balance should be ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should delete the burn object after processing it', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, tokenController, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions('100');

    const { amount: burnAmount, contractAddress: contract, burnedAt: burnTimestamp } = await staking.burn();
    assert(burnAmount.eqn(0), `Expected burned amount to be 0, found ${burnAmount}`);
    assert(
      contract === '0x0000000000000000000000000000000000000000',
      `Expected contractAddress to be 0x, found ${contract}`,
    );
    assert(burnTimestamp.eqn(0), `Expected burn timestamp to be 0, found ${burnTimestamp}`);
  });

  it('should reset processedToStakerIndex', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, tokenController, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions('100');

    const processedToStakerIndex = await staking.processedToStakerIndex();
    assert(processedToStakerIndex.eqn(0), `Expected processedToStakerIndex to be 0, found ${processedToStakerIndex}`);
  });

  it('should reset isContractStakeCalculated', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, tokenController, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions('100');

    const isContractStakeCalculated = await staking.isContractStakeCalculated();
    assert.isFalse(
      isContractStakeCalculated,
      `Expected isContractStakeCalculated to be false, found ${isContractStakeCalculated}`,
    );
  });

  it('should do up to maxIterations and finish in stakers.length * 2 cycles', async function () {
    const { token, tokenController, master, staking, memberRoles } = this;
    const iterationsNeeded = accounts.generalPurpose.length * 2;

    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    for (const account of accounts.generalPurpose) {
      await master.enrollMember(account, Role.Member);
      await memberRoles.setRole(account, Role.Member);
      await fundAndStake(token, tokenController, staking, ether('10'), firstContract, account);
    }

    await staking.pushBurn(firstContract, ether('9'), { from: internalContract });

    let process = await staking.processPendingActions(`${iterationsNeeded - 1}`);
    expectEvent(process, 'PendingActionsProcessed', { finished: false });

    process = await staking.processPendingActions('1');
    expectEvent(process, 'PendingActionsProcessed', { finished: true });

    const processedToStakerIndex = await staking.processedToStakerIndex();
    assert(processedToStakerIndex.eqn(0), `Expected processedToStakerIndex to be 0, found ${processedToStakerIndex}`);
  });

  it('should emit Burned event', async function () {
    const { token, tokenController, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days
    await fundAndStake(token, tokenController, staking, ether('10'), firstContract, memberOne);

    await staking.pushBurn(firstContract, ether('2'), { from: internalContract });
    const process = await staking.processPendingActions('100');

    expectEvent(process, 'Burned', {
      contractAddress: firstContract,
      amount: ether('2'),
    });
  });

  it('should properly calculate staked data on a contract when calculating in batches', async function () {
    const { master, staking, token, tokenController, memberRoles } = this;
    const numberOfStakers = accounts.generalPurpose.length;

    assert(numberOfStakers > 50, `expected to have at least 50 general purpose accounts, got ${numberOfStakers}`);

    for (const account of accounts.generalPurpose) {
      await master.enrollMember(account, Role.Member);
      await memberRoles.setRole(account, Role.Member);
      await fundAndStake(token, tokenController, staking, ether('10'), firstContract, account);
    }

    const actualInitialStake = await staking.contractStake(firstContract);
    const expectedInitialStake = ether('10').muln(numberOfStakers);
    assert(
      expectedInitialStake.eq(actualInitialStake),
      `Expected contract stake ${expectedInitialStake}, found ${actualInitialStake}`,
    );

    // push a burn
    const burnAmount = ether(`${numberOfStakers}`);
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });

    let receipt = await staking.processPendingActions('10');
    expectEvent(receipt, 'PendingActionsProcessed', { finished: false });

    const isContractStakeCalculated = await staking.isContractStakeCalculated();
    assert.isFalse(isContractStakeCalculated, 'stake calculation should not be complete with 10 iterations');

    // process everything
    receipt = await staking.processPendingActions(`${numberOfStakers * 2}`);
    expectEvent(receipt, 'PendingActionsProcessed', { finished: true });

    const actualStake = await staking.contractStake(firstContract);
    const expectedStake = ether('10').muln(numberOfStakers).sub(burnAmount);
    assert(actualStake.eq(expectedStake), `Expected ps balance to be ${expectedStake} found ${actualStake}`);

    const actualBalance = await token.balanceOf(staking.address);
    const expectedBalance = ether('10').muln(numberOfStakers).sub(burnAmount);
    assert(actualBalance.eq(expectedBalance), `Expected ps balance to be ${expectedBalance} found ${actualBalance}`);

    for (const account of accounts.generalPurpose) {
      await master.enrollMember(account, Role.Member);
      await fundAndStake(token, tokenController, staking, ether('10'), firstContract, account);
    }
  });
});
