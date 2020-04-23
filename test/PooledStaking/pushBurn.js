const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const accounts = require('../utils/accounts');
const setup = require('../utils/setup');
const { ParamType } = require('../utils/constants');
const { parseLogs } = require('../utils/helpers');

const {
  nonMembers: [nonMember],
  members: [memberOne, memberTwo],
  internalContracts: [internalContract],
  nonInternalContracts: [nonInternal],
  governanceContracts: [governanceContract],
} = accounts;

const firstContract = '0x0000000000000000000000000000000000000001';
const secondContract = '0x0000000000000000000000000000000000000002';
const thirdContract = '0x0000000000000000000000000000000000000003';

async function fundAndApprove (token, staking, amount, member) {
  const maxLeverage = '2';
  await staking.updateParameter(ParamType.MAX_LEVERAGE, maxLeverage, { from: governanceContract });

  await token.transfer(member, amount); // fund member account from default address
  await token.approve(staking.address, amount, { from: member });
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
  //
  // it('should revert when called with pending burns', async function () {
  //
  //     const { master, staking } = this;
  //
  //     assert.strictEqual(await master.isInternal(nonInternal), false);
  //
  //     await expectRevert(
  //         staking.pushBurn(firstContract, ether('1'), { from: nonInternal }),
  //         'Caller is not an internal contract',
  //     );
  // });
  //
  // it('should revert when called with pending deallocations', async function () {
  //
  //     const { master, staking } = this;
  //
  //     assert.strictEqual(await master.isInternal(nonInternal), false);
  //
  //     await expectRevert(
  //         staking.pushBurn(firstContract, ether('1'), { from: nonInternal }),
  //         'Caller is not an internal contract',
  //     );
  // });

  it('should revert when burn amount exceeds total amount staked on contract', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account
    await fundAndApprove(token, staking, amount, memberOne);

    // Stake 10
    await staking.stake(amount, [firstContract], [amount], { from: memberOne });

    // Burn 15
    await expectRevert(
      staking.pushBurn(firstContract, ether('15'), { from: internalContract }),
      'Burn amount should not exceed total amount staked on contract',
    );
  });

  it('ensure it burns the correct amount', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account
    await fundAndApprove(token, staking, amount, memberOne);

    // Stake 10
    await staking.stake(amount, [firstContract], [amount], { from: memberOne });

    // Burn 5
    staking.pushBurn(firstContract, ether('5'), { from: internalContract });

    const { burned: burnedAmount } = await staking.contracts(firstContract);
    assert(burnedAmount.eq(ether('5')), `Expected burned amount ${ether('5')}, found ${burnedAmount}`);

  });

  it('ensure firstBurn is set correctly', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account
    await fundAndApprove(token, staking, amount, memberOne);

    // Stake
    await staking.stake(amount, [firstContract], [amount], { from: memberOne });

    let firstBurn = await staking.firstBurn();
    assert(firstBurn == 0, `Expected firstBurn to be 0, found ${firstBurn}`);

    // First Burn
    staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    firstBurn = await staking.firstBurn();
    assert(firstBurn == 1, `Expected firstBurn to be 1, found ${firstBurn}`);

    // Second Burn
    staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    firstBurn = await staking.firstBurn();
    assert(firstBurn == 1, `Expected firstBurn to be 1, found ${firstBurn}`);
  });

  it('ensure lastBurnId is set correctly', async function () {

    const { token, staking } = this;
    const amount = ether('10');

    // Fund account
    await fundAndApprove(token, staking, amount, memberOne);
    // Stake
    await staking.stake(amount, [firstContract], [amount], { from: memberOne });
    let lastBurnId = await staking.lastBurnId();
    assert(lastBurnId == 0, `Expected lastBurnId to be 0, found ${lastBurnId}`);

    // First Burn
    staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    lastBurnId = await staking.lastBurnId();
    assert(lastBurnId == 1, `Expected lastBurnId to be 1, found ${lastBurnId}`);

    // Second Burn
    staking.pushBurn(firstContract, ether('1'), { from: internalContract });
    lastBurnId = await staking.lastBurnId();
    assert(lastBurnId == 2, `Expected lastBurnId to be 2, found ${lastBurnId}`);
  });

  it('ensure the burns mapping is updated correctly', async function () {

    const { token, staking } = this;

    // Fund account
    await fundAndApprove(token, staking, ether('10'), memberOne);
    // Stake
    await staking.stake(ether('10'), [firstContract], [ether('10')], { from: memberOne });

    // First Burn
    staking.pushBurn(firstContract, ether('5'), { from: internalContract });
    const { amount: firstAmount, contractAddress: firstAddress } = await staking.burns(1);
    assert(firstAmount.eq(ether('5')), `Expected burned contract to be ${ether('5')}, found ${firstAmount}`);
    assert(firstAddress === firstContract, `Expected burned contract to be ${firstContract}, found ${firstAddress}`);

    // Second Burn
    staking.pushBurn(firstContract, ether('1'), { from: internalContract });
    const { amount: sndAmount, burnedAt: burnedTime2, contractAddress: sndAddress } = await staking.burns(2);
    assert(sndAmount.eq(ether('1')), `Expected snd burned contract to be ${ether('1')}, found ${sndAmount}`);
    assert(sndAddress === firstContract, `Expected snd burned contract to be ${firstContract}, found ${sndAddress}`);
  });

});
