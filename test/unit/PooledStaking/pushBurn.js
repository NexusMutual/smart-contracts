const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils').accounts;
const { ParamType } = require('../utils').constants;
const setup = require('../setup');

const {
  members: [memberOne],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';

async function fundAndStake (token, staking, amount, contract, member) {
  const maxLeverage = '2';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });

  await staking.stake(amount, [contract], [amount], { from: member });

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

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // First Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    const { amount: firstAmount, contractAddress: firstAddress } = await staking.burns(1);
    assert(firstAmount.eq(ether('5')), `Expected burned contract to be ${ether('5')}, found ${firstAmount}`);
    assert(firstAddress === firstContract, `Expected burned contract to be ${firstContract}, found ${firstAddress}`);

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: internalContract }),
      'Unable to execute request with unprocessed burns',
    );
  });

  it('should revert when called with pending deallocations', async function () {

    const { token, staking } = this;

    // Fund account and stake
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Request Deallocation
    await staking.requestDeallocation([firstContract], [ether('5')], 0, { from: memberOne });

    await expectRevert(
      staking.pushBurn(firstContract, ether('1'), { from: internalContract }),
      'Unable to execute request with unprocessed deallocations',
    );
  });

  it('should revert when burn amount exceeds total amount staked on contract', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Burn 15
    await expectRevert(
      staking.pushBurn(firstContract, ether('15'), { from: internalContract }),
      'Burn amount should not exceed total amount staked on contract',
    );
  });

  it('should burn the correct amount', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Burn 5
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });

    const { burned: burnedAmount } = await staking.contracts(firstContract);
    assert(burnedAmount.eq(ether('5')), `Expected burned amount ${ether('5')}, found ${burnedAmount}`);

  });

  it('should set firstBurn correctly', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    let firstBurn = await staking.firstBurn();
    assert(firstBurn.eqn(0), `Expected firstBurn to be 0, found ${firstBurn}`);

    // First Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    firstBurn = await staking.firstBurn();
    assert(firstBurn.eqn(1), `Expected firstBurn to be 1, found ${firstBurn}`);

    await staking.processPendingActions();

    // Second Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    firstBurn = await staking.firstBurn();
    assert(firstBurn.eqn(2), `Expected firstBurn to be 2, found ${firstBurn}`);
  });

  it('should set lastBurnId correctly', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);
    let lastBurnId = await staking.lastBurnId();
    assert(lastBurnId.eqn(0), `Expected lastBurnId to be 0, found ${lastBurnId}`);

    // First Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    lastBurnId = await staking.lastBurnId();
    assert(lastBurnId.eqn(1), `Expected lastBurnId to be 1, found ${lastBurnId}`);

    await staking.processPendingActions();

    // Second Burn
    await staking.pushBurn(firstContract, ether('1'), { from: internalContract });
    lastBurnId = await staking.lastBurnId();
    assert(lastBurnId.eqn(2), `Expected lastBurnId to be 2, found ${lastBurnId}`);
  });

  it('should update burns mapping correctly', async function () {

    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // First Burn
    await staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    const { amount: firstAmount, contractAddress: firstAddress } = await staking.burns(1);
    assert(firstAmount.eq(ether('5')), `Expected burned contract to be ${ether('5')}, found ${firstAmount}`);
    assert(firstAddress === firstContract, `Expected burned contract to be ${firstContract}, found ${firstAddress}`);

    await staking.processPendingActions();

    // Second Burn
    await staking.pushBurn(firstContract, ether('1'), { from: internalContract });
    const { amount: sndAmount, burnedAt: burnedTime2, contractAddress: sndAddress } = await staking.burns(2);
    assert(sndAmount.eq(ether('1')), `Expected snd burned contract to be ${ether('1')}, found ${sndAmount}`);
    assert(sndAddress === firstContract, `Expected snd burned contract to be ${firstContract}, found ${sndAddress}`);
  });

  it('should burn the correct amount', async function () {
    const { token, staking } = this;

    // Fund account and stake 10
    await fundAndStake(token, staking, ether('10'), firstContract, memberOne);

    // Burn 3
    await staking.pushBurn(firstContract, ether('3'), { from: internalContract });
    // Expect balance left 7
    const leftBalance = await token.balanceOf(staking.address);
    assert(leftBalance.eq(ether('7')), `Expected left balance after burn to be ${ether('7')}, found ${leftBalance}`);
  });
});
