const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType, Role } = require('../utils').constants;
const setup = require('../setup');

const {
  members: [memberOne, memberTwo, memberThree, fourthContract],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndStake (token, staking, amount, contract, member) {
  await staking.updateParameter(ParamType.MAX_LEVERAGE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
  await staking.stake(amount, [contract], [amount], { from: member });
}

async function setLockTime (staking, lockTime) {
  return staking.updateParameter(ParamType.DEALLOCATE_LOCK_TIME, lockTime, { from: governanceContract });
}

describe('processFirstBurn', function () {
  beforeEach(setup);

  it('should update staker.staked & staker.allocations correctly', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const initialStake = ether('10');
    await fundAndStake(token, staking, initialStake, firstContract, memberOne);

    // Burn 3
    await staking.pushBurn(firstContract, ether('3'), { from: internalContract });
    await staking.processPendingActions();

    // Expect staker.staked to be 7
    let newStake = await staking.stakerStake(memberOne);
    assert(newStake.eq(ether('7')), `Expected new stake to be ${ether('7')}, found ${newStake}`);
    let newAllocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(newAllocation.eq(ether('7')), `Expected new stake to be ${ether('7')}, found ${newAllocation}`);

    // Burn 9
    await staking.pushBurn(firstContract, ether('9'), { from: internalContract });
    await staking.processPendingActions();

    // Expect staker.staked to be 0
    newStake = await staking.stakerStake(memberOne);
    assert(newStake.eq(ether('0')), `Expected new stake to be ${ether('0')}, found ${newStake}`);
    newAllocation = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(newAllocation.eq(ether('0')), `Expected new stake to be ${ether('0')}, found ${newAllocation}`);
  });

  it('should update staker.staked & staked.allocations correctly for multiple stakers', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Multiple stakers
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);
    await fundAndStake(token, staking, ether('200'), firstContract, memberTwo);
    await fundAndStake(token, staking, ether('300'), firstContract, memberThree);

    await staking.pushBurn(firstContract, ether('90'), { from: internalContract });
    await staking.processPendingActions();

    const newStakeOne = await staking.stakerStake(memberOne);
    assert(newStakeOne.eq(ether('85')), `Expected new stake one to be ${ether('85')}, found ${newStakeOne}`);
    const newAllocationOne = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(newAllocationOne.eq(ether('85')), `Expected new allocation one to be ${ether('85')}, found ${newAllocationOne}`);

    const newStakeTwo = await staking.stakerStake(memberTwo);
    assert(newStakeTwo.eq(ether('170')), `Expected new stake two to be ${ether('170')}, found ${newStakeTwo}`);
    const newAllocationTwo = await staking.stakerContractAllocation(memberTwo, firstContract);
    assert(newAllocationTwo.eq(ether('170')), `Expected new allocation two to be ${ether('170')}, found ${newAllocationTwo}`);

    const newStakeThree = await staking.stakerStake(memberThree);
    assert(newStakeThree.eq(ether('255')), `Expected new stake three to be ${ether('255')}, found ${newStakeThree}`);
    const newAllocationThree = await staking.stakerContractAllocation(memberThree, firstContract);
    assert(newAllocationThree.eq(ether('255')), `Expected new allocation three to be ${ether('255')}, found ${newAllocationThree}`);
  });

  it('should update staker.staked & staked.allocations correctly for multiple stakers when total staked is less than amount burned', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Multiple stakers
    await fundAndStake(token, staking, ether('100'), firstContract, memberOne);
    await fundAndStake(token, staking, ether('200'), firstContract, memberTwo);
    await fundAndStake(token, staking, ether('300'), firstContract, memberThree);

    await staking.pushBurn(firstContract, ether('700'), { from: internalContract });
    await staking.processPendingActions();

    const newStakeOne = await staking.stakerStake(memberOne);
    assert(newStakeOne.eq(ether('0')), `Expected new stake one to be ${ether('0')}, found ${newStakeOne}`);
    const newAllocationOne = await staking.stakerContractAllocation(memberOne, firstContract);
    assert(newAllocationOne.eq(ether('0')), `Expected new allocation one to be ${ether('0')}, found ${newAllocationOne}`);

    const newStakeTwo = await staking.stakerStake(memberTwo);
    assert(newStakeTwo.eq(ether('0')), `Expected new stake two to be ${ether('0')}, found ${newStakeTwo}`);
    const newAllocationTwo = await staking.stakerContractAllocation(memberTwo, firstContract);
    assert(newAllocationTwo.eq(ether('0')), `Expected new allocation two to be ${ether('0')}, found ${newAllocationTwo}`);

    const newStakeThree = await staking.stakerStake(memberThree);
    assert(newStakeThree.eq(ether('0')), `Expected new stake three to be ${ether('0')}, found ${newStakeThree}`);
    const newAllocationThree = await staking.stakerContractAllocation(memberThree, firstContract);
    assert(newAllocationThree.eq(ether('0')), `Expected new allocation three to be ${ether('0')}, found ${newAllocationThree}`);
  });

  it('should process burn when staked amount on contract is 0', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await staking.pushBurn(firstContract, ether('30'), { from: internalContract });
    await staking.processPendingActions();
  });

  it('should remove and re-add 0-account stakers', async function () {

    const { token, staking } = this;

    await staking.updateParameter(ParamType.MAX_LEVERAGE, ether('2'), { from: governanceContract });

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
      await token.approve(staking.address, ether(stake.amount), { from: member });
      await staking.stake(
        ether(stake.amount),
        stake.on,
        stake.amounts.map(ether),
        { from: member },
      );
    }

    const expectedFirstContractStake = ether('40');
    const actulFirstContractStake = await staking.contractStake(firstContract);
    assert(
      expectedFirstContractStake.eq(actulFirstContractStake),
      `firstContract stake should be ${expectedFirstContractStake} but found ${actulFirstContractStake}`,
    );

    const initialStakers = await staking.contractStakers(firstContract);
    const expectedInitialStakers = [memberOne, memberThree];
    assert.deepEqual(
      initialStakers,
      expectedInitialStakers,
      `expected initial stakers to be "${expectedInitialStakers.join(',')}" but found "${initialStakers.join(',')}"`,
    );

    // burn everything on the first contract
    await staking.pushBurn(firstContract, ether('40'), { from: internalContract });
    await staking.processPendingActions();

    const firstContractStake = await staking.contractStake(firstContract);
    assert(ether('0').eq(firstContractStake), `firstContract stake should be 0 but found ${firstContractStake}`);

    const secondTestStakers = await staking.contractStakers(firstContract);
    const expectedSecondTestStakers = [];
    assert.deepEqual(
      secondTestStakers,
      expectedSecondTestStakers,
      `expected initial stakers to be "${expectedSecondTestStakers.join(',')}" but found "${secondTestStakers.join(',')}"`,
    );

    // push a small burn on secondContract and expect firstStaker to be "removed
    await staking.pushBurn(secondContract, ether('1'), { from: internalContract });
    await staking.processPendingActions();

    const finalStakers = await staking.contractStakers(secondContract);
    const finalExpectedStakers = [memberTwo];
    assert.deepEqual(
      finalStakers,
      finalExpectedStakers,
      `expected initial stakers to be "${finalStakers.join(',')}" but found "${finalStakers.join(',')}"`,
    );

    await token.transfer(memberOne, ether('5'));
    await token.approve(staking.address, ether('5'), { from: memberOne });
    await staking.stake(
      ether('5'),
      [firstContract, secondContract, thirdContract],
      [0, ether('5'), ether('5')],
      { from: memberOne },
    );

    const newStakers = await staking.contractStakers(secondContract);
    const newExpectedStakers = [memberTwo, memberOne];
    assert.deepEqual(
      newStakers,
      newExpectedStakers,
      `expected initial stakers to be "${newExpectedStakers.join(',')}" but found "${newStakers.join(',')}"`,
    );
  });

  it('should burn the correct amount of tokens', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const stakeAmount = ether('10');
    await fundAndStake(token, staking, stakeAmount, firstContract, memberOne);

    // Push a burn of 6
    const burnAmount = ether('6');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });
    await staking.processPendingActions();

    const expectedBalance = stakeAmount.sub(burnAmount);
    const currentBalance = await token.balanceOf(staking.address);
    assert(
      currentBalance.eq(expectedBalance),
      `staking contract balance should be ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should burn up to contract stake if requested a bigger burn than available', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const stakeAmount = ether('10');
    await fundAndStake(token, staking, stakeAmount, firstContract, memberOne);

    // Push a burn of 100
    const burnAmount = ether('100');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });
    await staking.processPendingActions();

    const expectedBalance = ether('0');
    const currentBalance = await token.balanceOf(staking.address);
    assert(
      currentBalance.eq(expectedBalance),
      `staking contract balance should be ${expectedBalance}, found ${currentBalance}`,
    );
  });

  it('should prevent the other contracts\' allocations to exceed remaining stake', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, staking, ether('300'), firstContract, memberOne);
    const contracts = [firstContract, secondContract, thirdContract, fourthContract];
    const amounts = [ether('300'), ether('50'), ether('100'), ether('120')];
    await staking.stake(ether('0'), contracts, amounts, { from: memberOne });

    // Push a burn of 200
    await staking.pushBurn(firstContract, ether('200'), { from: internalContract });
    await staking.processPendingActions();

    // Check no allocation is greater than the stake
    const stake = await staking.stakerStake(memberOne);
    for (let i = 0; i < contracts.length; i++) {
      const allocation = await staking.stakerContractAllocation(memberOne, contracts[i]);
      assert(allocation.lte(stake));
    }
  });

  it('should delete the burn object after processing it', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions();

    const { amount: burnAmount, contractAddress: contract, burnedAt: burnTimestamp } = await staking.burn();
    assert(burnAmount.eqn(0), `Expected burned amount to be 0, found ${burnAmount}`);
    assert(contract === '0x0000000000000000000000000000000000000000', `Expected contractAddress to be 0x, found ${contract}`);
    assert(burnTimestamp.eqn(0), `Expected burn timestamp to be 0, found ${burnTimestamp}`);
  });

  it('should reset processedToStakerIndex', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions();

    const processedToStakerIndex = await staking.processedToStakerIndex();
    assert(processedToStakerIndex.eqn(0), `Expected processedToStakerIndex to be 0, found ${processedToStakerIndex}`);
  });

  it('should reset contractStakeCalculated', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    await fundAndStake(token, staking, ether('300'), firstContract, memberOne);
    await staking.pushBurn(firstContract, ether('100'), { from: internalContract });
    await staking.processPendingActions();

    const contractStakeCalculated = await staking.contractStakeCalculated();
    assert.isFalse(contractStakeCalculated, `Expected contractStakeCalculated to be false, found ${contractStakeCalculated}`);
  });

  it('should batch process if gas is not enough', async function () {

    this.timeout(0);
    const { token, master, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    for (const account of accounts.generalPurpose) {
      await master.enrollMember(account, Role.Member);
      await fundAndStake(token, staking, ether('10'), firstContract, account);
    }

    await staking.pushBurn(firstContract, ether('9'), { from: internalContract });

    let process = await staking.processPendingActions({ gas: 650000 });
    expectEvent(process, 'PendingActionsProcessed', { finished: false });

    process = await staking.processPendingActions({ gas: 1000000 });
    expectEvent(process, 'PendingActionsProcessed', { finished: true });
    const processedToStakerIndex = await staking.processedToStakerIndex();
    assert(processedToStakerIndex.eqn(0), `Expected processedToStakerIndex to be 0, found ${processedToStakerIndex}`);
  });

  it('should emit Burned event', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    const burn = await staking.pushBurn(firstContract, ether('2'), { from: internalContract });
    const process = await staking.processPendingActions();

    expectEvent(process, 'Burned', {
      contractAddress: firstContract,
      amount: ether('2'),
    });
  });

});
