const { web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { accounts, helpers } = require('../utils');

const { members: [member], internalContracts: [internal] } = accounts;
const { hex } = helpers;
const { toBN } = web3.utils;

const days = n => 3600 * 24 * n;
const [R0, R1, R2, R3] = ['R0', 'R1', 'R2', 'R3'].map(hex);

const getReason = async (tc, member, index) => {
  const zeroPaddedReason = await tc.lockReason(member, index);
  return zeroPaddedReason.replace(/(00)+$/, '');
};

describe('removeEmptyReason', function () {

  it('reverts when lockReason array is empty', async function () {

    const { tokenController } = this;

    await expectRevert(
      tokenController.removeEmptyReason(member, '0x', '0'),
      'TokenController: lockReason is empty',
    );
  });

  it('reverts when index is out of bounds', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });

    await expectRevert(
      tokenController.removeEmptyReason(member, '0x', '1'),
      'TokenController: index out of array bounds',
    );
  });

  it('reverts when index points to a different reason', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockOf(member, R0, ether('50'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R1, ether('50'), lockPeriod, { from: internal });

    await expectRevert(
      tokenController.removeEmptyReason(member, R0, '1'),
      'TokenController: bad reason index',
    );
  });

  it('reverts when reason amount is not zero', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });

    await expectRevert(
      tokenController.removeEmptyReason(member, R0, '0'),
      'TokenController: reason amount is not zero',
    );
  });

  it('works correctly when reasons array has a single item', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });

    const reason = await getReason(tokenController, member, '0');
    assert.strictEqual(reason, R0);

    const locked = await tokenController.locked(member, R0);
    assert.strictEqual(locked.amount.toString(), ether('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.releaseLockedTokens(member, R0, ether('100'), { from: internal });
    await tokenController.removeEmptyReason(member, R0, '0');

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expectRevert.assertion(
      tokenController.lockReason(member, '0'),
    );
  });

  it('swaps first and last items in the array and then pops the last item', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('500'), { from: internal });
    await token.approve(tokenController.address, ether('500'), { from: member });

    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R1, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R2, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R3, ether('100'), lockPeriod, { from: internal });

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsBefore, [R0, R1, R2, R3]);

    const locked = await tokenController.locked(member, R0);
    assert.strictEqual(locked.amount.toString(), ether('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.releaseLockedTokens(member, R0, ether('100'), { from: internal });
    await tokenController.removeEmptyReason(member, R0, '0');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expectRevert.assertion(
      tokenController.lockReason(member, '3'),
    );

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsAfter, [R3, R1, R2]);
  });

  it('swaps second and last items in the array and then pops the last item', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('500'), { from: internal });
    await token.approve(tokenController.address, ether('500'), { from: member });

    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R1, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R2, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R3, ether('100'), lockPeriod, { from: internal });

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsBefore, [R0, R1, R2, R3]);

    const locked = await tokenController.locked(member, R0);
    assert.strictEqual(locked.amount.toString(), ether('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.releaseLockedTokens(member, R1, ether('100'), { from: internal });
    await tokenController.removeEmptyReason(member, R1, '1');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expectRevert.assertion(
      tokenController.lockReason(member, '3'),
    );

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsAfter, [R0, R3, R2]);
  });

  it('pops the last item in the array when the removed reason is the last', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('500'), { from: internal });
    await token.approve(tokenController.address, ether('500'), { from: member });

    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R1, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R2, ether('100'), lockPeriod, { from: internal });
    await tokenController.lockOf(member, R3, ether('100'), lockPeriod, { from: internal });

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsBefore, [R0, R1, R2, R3]);

    const locked = await tokenController.locked(member, R0);
    assert.strictEqual(locked.amount.toString(), ether('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.releaseLockedTokens(member, R3, ether('100'), { from: internal });
    await tokenController.removeEmptyReason(member, R3, '3');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expectRevert.assertion(
      tokenController.lockReason(member, '3'),
    );

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member, index)),
    );

    assert.deepStrictEqual(reasonsAfter, [R0, R1, R2]);
  });

  it('works when the reason amount was burned instead of released', async function () {

    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));

    await tokenController.mint(member, ether('100'), { from: internal });
    await token.approve(tokenController.address, ether('100'), { from: member });
    await tokenController.lockOf(member, R0, ether('100'), lockPeriod, { from: internal });

    const reason = await getReason(tokenController, member, '0');
    assert.strictEqual(reason, R0);

    const locked = await tokenController.locked(member, R0);
    assert.strictEqual(locked.amount.toString(), ether('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.burnLockedTokens(member, R0, ether('100'), { from: internal });
    await tokenController.removeEmptyReason(member, R0, '0');

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expectRevert.assertion(
      tokenController.lockReason(member, '0'),
    );
  });

});
