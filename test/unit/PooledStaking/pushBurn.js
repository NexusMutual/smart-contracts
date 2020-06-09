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
  await staking.updateUintParameters(ParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });
  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
  await staking.depositAndStake(amount, [contract], [amount], { from: member });
}

async function setLockTime (staking, lockTime) {
  return staking.updateUintParameters(ParamType.UNSTAKE_LOCK_TIME, lockTime, { from: governanceContract });
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

  it('should revert when called with pending unstake requests', async function () {

    const { token, staking } = this;

    // Set parameters
    await setLockTime(staking, 90 * 24 * 3600); // 90 days

    // Fund account and stake; UNSTAKE_LOCK_TIME = 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Request unstake due in 90 days
    await staking.requestUnstake([firstContract], [ether('3')], 0, { from: memberOne });

    // No unstake requests that were already due, should be able to push burn
    await staking.pushBurn(firstContract, ether('1'), { from: internalContract });

    // 1 hour passes
    await time.increase(3600);
    // Process the burn we pushed earlier
    await staking.processPendingActions('100');
    // 90 days pass
    await time.increase(90 * 24 * 3600);

    // One unstake request due, can't push a burn
    await expectRevert(
      staking.pushBurn(firstContract, ether('2'), { from: internalContract }),
      'Unable to execute request with unprocessed unstake requests',
    );
  });

  it('should update the burned amount', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    const burnAmount = ether('3');
    await staking.pushBurn(firstContract, burnAmount, { from: internalContract });

    const { amount: actualBurnAmount } = await staking.burn();
    assert(actualBurnAmount.eq(burnAmount), `Expected burned amount ${burnAmount}, found ${actualBurnAmount}`);
  });

  it('should update the burn timestamp ', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });

    const timestamp = await time.latest();
    const { burnedAt: actualBurnedAt } = await staking.burn();
    assert(actualBurnedAt.eq(timestamp), `Expected burned timestamp ${timestamp}, found ${actualBurnedAt}`);
  });

  it('should update the burned contract', async function () {

    const { token, staking } = this;
    await setLockTime(staking, 90 * 24 * 3600); // 90 days
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });

    const { contractAddress: contract } = await staking.burn();
    assert(contract === firstContract, `Expected burned contract ${firstContract}, found ${contract}`);
  });

  it('should emit BurnRequested event', async function () {

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
  });

  it('should remove and re-add 0-account stakers', async function () {

    const { token, staking } = this;

    await staking.updateUintParameters(ParamType.MAX_EXPOSURE, ether('2'), { from: governanceContract });

    const stakes = {
      [memberOne]: { amount: '10', on: [firstContract, secondContract, thirdContract], amounts: ['10', '10', '10'] },
      [memberTwo]: { amount: '20', on: [secondContract, thirdContract], amounts: ['20', '20'] },
      [memberThree]: { amount: '30', on: [firstContract, thirdContract], amounts: ['30', '30'] },
    };

    for (const member in stakes) {
      const stake = stakes[member];
      await token.transfer(member, ether(stake.amount));
      await token.approve(staking.address, ether(stake.amount), { from: member });
      await staking.depositAndStake(
        ether(stake.amount),
        stake.on,
        stake.amounts.map(ether),
        { from: member },
      );
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
      `expected initial stakers to be "${expectedSecondTestStakers.join(',')}" but found "${secondTestStakers.join(',')}"`,
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
    await token.approve(staking.address, ether('5'), { from: memberOne });
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

});
