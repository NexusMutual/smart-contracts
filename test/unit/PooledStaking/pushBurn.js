const { ether, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType } = require('../utils').constants;
const setup = require('../setup');

const {
  members: [memberOne, memberTwo, memberThree],
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

describe('pushBurn', function () {

  beforeEach(setup);

  it('should revert when called by non internal contract', async function () {

    const { master, staking } = this;

    assert.strictEqual(await master.isInternal(nonInternal), false);

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: nonInternal }),
      'Caller is not an internal contract',
    );
  });

  it('should revert when called with pending burns', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // First Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    const { amount: firstAmount, contractAddress: firstAddress } = await staking.burn();

    assert(firstAmount.eq(ether('5')), `Expected burned contract to be ${ether('5')}, found ${firstAmount}`);
    assert(firstAddress === firstContract, `Expected burned contract to be ${firstContract}, found ${firstAddress}`);

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: internalContract }),
      'Unable to execute request with unprocessed burns',
    );
  });

  it('should revert when called with pending deallocations', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake; DEALLOCATE_LOCK_TIME = 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Request deallocation due in 90 days
    await staking.requestDeallocation([firstContract], [ether('3')], 0, { from: memberOne });

    // No deallocations that were already due, should be able to push burn
    await staking.pushBurn(firstContract, ether('1'), { from: internalContract });

    // 1 hour passes
    await time.increase(3600);
    // Process the burn we pushed earlier
    await staking.processPendingActions();
    // 90 days pass
    await time.increase(90 * 24 * 3600);

    // One deallocation due, can't push a burn
    await expectRevert(
      staking.pushBurn(firstContract, ether('2'), { from: internalContract }),
      'Unable to execute request with unprocessed deallocations',
    );
  });

  it('should update the burned amount for the given contract', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    const initialStake = ether('10');
    await fundAndStake(token, staking, initialStake, firstContract, memberOne);

    // Burn 3
    const burnAmount = ether('3');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });
    await staking.processPendingActions();

    // Expect contract.burned to be 3
    const newStake = await staking.contractStake(firstContract);
    const actualBurned = initialStake.sub(newStake);
    assert(actualBurned.eq(burnAmount), `Expected burned amount ${burnAmount}, found ${actualBurned}`);
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

  it('should update burn variable correctly', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Push first burn
    const firstBurnAmount = ether('2');
    await staking.pushBurn(firstContract, firstBurnAmount, { from: internalContract });

    // Check the Burn has been pushed to the burns mapping
    const { amount, burnedAt, contractAddress } = await staking.burn();
    const now = await time.latest();

    assert(
      amount.eq(firstBurnAmount),
      `Expected firstburned amount to be ${firstBurnAmount}, found ${amount}`,
    );

    assert.equal(
      contractAddress,
      firstContract,
      `Expected burned contract to be ${firstContract}, found ${contractAddress}`,
    );

    assert(
      burnedAt.eq(now),
      `Expected burn time to be ${now}, found ${burnedAt}`,
    );
  });

  it('should emit BurnRequested and Burned events', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Push burn
    const burnAmount = ether('2');
    const burn = await staking.pushBurn(firstContract, burnAmount, { from: internalContract });

    expectEvent(burn, 'BurnRequested', {
      contractAddress: firstContract,
      amount: burnAmount,
    });

    const process = await staking.processPendingActions();

    expectEvent(process, 'Burned', {
      contractAddress: firstContract,
      amount: burnAmount,
    });
  });

  it.only('should remove and re-add 0-account stakers', async function () {

    const { token, staking } = this;

    await staking.updateParameter(ParamType.MAX_LEVERAGE, ether('2'), { from: governanceContract });

    const stakes = {
      [memberOne]: { amount: '10', on: [firstContract, secondContract, thirdContract], amounts: ['10', '10', '10'] },
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

});
