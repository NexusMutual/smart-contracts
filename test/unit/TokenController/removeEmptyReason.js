const { assert, expect } = require('chai');
const { helpers } = require('../utils');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { parseEther, arrayify } = ethers.utils;

const { zeroPadRight } = helpers;

const days = n => 3600 * 24 * n;
const [R0, R1, R2, R3] = ['R0', 'R1', 'R2', 'R3'].map(x => zeroPadRight(Buffer.from(x), 32));
const EMPTY = zeroPadRight(Buffer.from([]), 32);

const getReason = async (tc, member, index) => {
  const zeroPaddedReason = await tc.lockReason(member, index);
  return arrayify(zeroPaddedReason);
};

describe('removeEmptyReason', function () {
  it('reverts when lockReason array is empty', async function () {
    const { tokenController, members } = this;
    const [member] = members;

    await expect(tokenController.removeEmptyReason(member.address, EMPTY, '0')).to.be.revertedWith(
      'TokenController: lockReason is empty',
    );
  });

  it('reverts when index is out of bounds', async function () {
    const { token, tokenController, members, internal } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('100'));
    await token.connect(member).approve(tokenController.address, parseEther('100'));
    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);

    await expect(tokenController.removeEmptyReason(member.address, EMPTY, '1')).to.be.reverted;
  });

  it('reverts when index points to a different reason', async function () {
    const { token, tokenController, internal, members } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('100'));
    await token.connect(member).approve(tokenController.address, parseEther('100'));
    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('50'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R1, parseEther('50'), lockPeriod);

    await expect(tokenController.removeEmptyReason(member.address, R0, '1')).to.be.revertedWith(
      'TokenController: bad reason index',
    );
  });

  it('reverts when reason amount is not zero', async function () {
    const { token, tokenController, members, internal } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('100'));
    await token.connect(member).approve(tokenController.address, parseEther('100'));
    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);

    await expect(tokenController.removeEmptyReason(member.address, R0, '0')).to.be.revertedWith(
      'TokenController: reason amount is not zero',
    );
  });

  it('works correctly when reasons array has a single item', async function () {
    const { token, tokenController, internal, members } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('100'));
    await token.connect(member).approve(tokenController.address, parseEther('100'));
    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);

    const reason = await getReason(tokenController, member.address, '0');
    expect(reason).to.be.deep.equal(R0);

    const locked = await tokenController.locked(member.address, R0);
    assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.connect(internal).releaseLockedTokens(member.address, R0, parseEther('100'));
    await tokenController.removeEmptyReason(member.address, R0, '0');

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expect(tokenController.lockReason(member.address, '0')).to.be.reverted;
  });

  it('swaps first and last items in the array and then pops the last item', async function () {
    const { token, tokenController, members, internal } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('500'));
    await token.connect(member).approve(tokenController.address, parseEther('500'));

    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R1, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R2, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R3, parseEther('100'), lockPeriod);

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member.address, index)),
    );

    // assert.deepStrictEqual(reasonsBefore, [R0, R1, R2, R3]);
    expect(reasonsBefore).to.be.deep.equal([R0, R1, R2, R3]);

    const locked = await tokenController.locked(member.address, R0);
    assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.connect(internal).releaseLockedTokens(member.address, R0, parseEther('100'));
    await tokenController.removeEmptyReason(member.address, R0, '0');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expect(tokenController.lockReason(member.address, '3')).to.be.reverted;

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member.address, index)),
    );

    expect(reasonsAfter).to.be.deep.equal([R3, R1, R2]);
  });

  it('swaps second and last items in the array and then pops the last item', async function () {
    const { token, tokenController, internal, members } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('500'));
    await token.connect(member).approve(tokenController.address, parseEther('500'));

    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R1, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R2, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R3, parseEther('100'), lockPeriod);

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member.address, index)),
    );

    expect(reasonsBefore).to.be.deep.equal([R0, R1, R2, R3]);

    const locked = await tokenController.locked(member.address, R0);
    assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.connect(internal).releaseLockedTokens(member.address, R1, parseEther('100'));
    await tokenController.removeEmptyReason(member.address, R1, '1');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expect(tokenController.lockReason(member.address, '3')).to.be.reverted;

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member.address, index)),
    );

    expect(reasonsAfter).to.be.deep.equal([R0, R3, R2]);
  });

  it('pops the last item in the array when the removed reason is the last', async function () {
    const { token, tokenController, members, internal } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('500'));
    await token.connect(member).approve(tokenController.address, parseEther('500'));

    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R1, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R2, parseEther('100'), lockPeriod);
    await tokenController.connect(internal).lockOf(member.address, R3, parseEther('100'), lockPeriod);

    const reasonsBefore = await Promise.all(
      ['0', '1', '2', '3'].map(index => getReason(tokenController, member.address, index)),
    );

    expect(reasonsBefore).to.be.deep.equal([R0, R1, R2, R3]);

    const locked = await tokenController.locked(member.address, R0);
    assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.connect(internal).releaseLockedTokens(member.address, R3, parseEther('100'));
    await tokenController.removeEmptyReason(member.address, R3, '3');

    // must have only 3 reasons, index 3 (fourth element) should revert on read
    await expect(tokenController.lockReason(member.address, '3')).to.be.reverted;

    const reasonsAfter = await Promise.all(
      ['0', '1', '2'].map(index => getReason(tokenController, member.address, index)),
    );

    expect(reasonsAfter).to.be.deep.equal([R0, R1, R2]);
  });

  it('works when the reason amount was burned instead of released', async function () {
    const { token, tokenController, internal, members } = this;
    const [member] = members;
    const lockPeriod = BigNumber.from(days(60));

    await tokenController.connect(internal).mint(member.address, parseEther('100'));
    await token.connect(member).approve(tokenController.address, parseEther('100'));
    await tokenController.connect(internal).lockOf(member.address, R0, parseEther('100'), lockPeriod);

    const reason = await getReason(tokenController, member.address, '0');
    expect(reason).to.be.deep.equal(R0);

    const locked = await tokenController.locked(member.address, R0);
    assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
    assert.isFalse(locked.claimed);

    await tokenController.connect(internal).burnLockedTokens(member.address, R0, parseEther('100'));
    await tokenController.removeEmptyReason(member.address, R0, '0');

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expect(tokenController.lockReason(member.address, '0')).to.be.reverted;
  });
});
