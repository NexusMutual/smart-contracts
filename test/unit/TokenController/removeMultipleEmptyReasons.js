const { assert, expect } = require('chai');
const { helpers } = require('../utils');
const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { zeroPadRight } = helpers;

const days = n => 3600 * 24 * n;
const [R0, R1, R2] = ['R0', 'R1', 'R2'].map(x => zeroPadRight(Buffer.from(x), 32));

describe('removeMultipleEmptyReasons', function () {
  it('reverts when members and reasons array lengths differ', async function () {
    const { tokenController, members } = this;
    const [firstMember] = members;
    await expect(tokenController.removeMultipleEmptyReasons([firstMember.address], [], ['0'])).to.be.revertedWith(
      'TokenController: members and reasons array lengths differ',
    );
  });

  it('reverts when reasons and indexes array lengths differ', async function () {
    const { tokenController, members } = this;
    const [firstMember] = members;
    await expect(tokenController.removeMultipleEmptyReasons([firstMember.address], [R0], [])).to.be.revertedWith(
      'TokenController: reasons and indexes array lengths differ',
    );
  });

  it('clears up all reasons if parameters are supplied correctly', async function () {
    const { token, tokenController, members, internal } = this;
    const lockPeriod = BigNumber.from(days(60));
    const reasons = [R2, R1, R0];
    const [firstMember, secondMember, thirdMember] = members;

    for (let i = 0; i < reasons.length; i++) {
      const member = members[i];
      const reason = reasons[i];

      await tokenController.connect(internal).mint(member.address, parseEther('100'));
      await token.connect(member).approve(tokenController.address, parseEther('100'));
      await tokenController.connect(internal).lockOf(member.address, reason, parseEther('100'), lockPeriod);

      const locked = await tokenController.locked(member.address, reason);
      assert.strictEqual(locked.amount.toString(), parseEther('100').toString());
      assert.isFalse(locked.claimed);

      await tokenController.connect(internal).burnLockedTokens(member.address, reason, parseEther('100'));
    }

    await tokenController.removeMultipleEmptyReasons(
      [firstMember, secondMember, thirdMember].map(x => x.address),
      reasons,
      ['0', '0', '0'],
    );

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expect(tokenController.lockReason([firstMember.address], '0')).to.be.reverted;
  });
});
