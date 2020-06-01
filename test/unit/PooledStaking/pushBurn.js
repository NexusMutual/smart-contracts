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
});
