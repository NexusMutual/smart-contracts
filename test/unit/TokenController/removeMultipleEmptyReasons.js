const { web3 } = require('hardhat');
const { ether, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { accounts, helpers } = require('../utils');

const {
  members,
  internalContracts: [internal],
} = accounts;
const [firstMember, secondMember, thirdMember] = members;
const { hex } = helpers;
const { toBN } = web3.utils;

const days = n => 3600 * 24 * n;
const [R0, R1, R2] = ['R0', 'R1', 'R2'].map(hex);

describe('removeMultipleEmptyReasons', function () {
  it('reverts when members and reasons array lengths differ', async function () {
    const { tokenController } = this;
    await expectRevert(
      tokenController.removeMultipleEmptyReasons([firstMember], [], ['0']),
      'TokenController: members and reasons array lengths differ',
    );
  });

  it('reverts when reasons and indexes array lengths differ', async function () {
    const { tokenController } = this;
    await expectRevert(
      tokenController.removeMultipleEmptyReasons([firstMember], [R0], []),
      'TokenController: reasons and indexes array lengths differ',
    );
  });

  it('clears up all reasons if parameters are supplied correctly', async function () {
    const { token, tokenController } = this;
    const lockPeriod = toBN(days(60));
    const reasons = [R2, R1, R0];
    const members = [firstMember, secondMember, thirdMember];

    for (let i = 0; i < reasons.length; i++) {
      const member = members[i];
      const reason = reasons[i];

      await tokenController.mint(member, ether('100'), { from: internal });
      await token.approve(tokenController.address, ether('100'), { from: member });
      await tokenController.lockOf(member, reason, ether('100'), lockPeriod, { from: internal });

      const locked = await tokenController.locked(member, reason);
      assert.strictEqual(locked.amount.toString(), ether('100').toString());
      assert.isFalse(locked.claimed);

      await tokenController.burnLockedTokens(member, reason, ether('100'), { from: internal });
    }

    await tokenController.removeMultipleEmptyReasons(members, reasons, ['0', '0', '0']);

    // the reason should have been removed
    // the getter should revert due to array out of bounds read (invalid opcode)
    await expectRevert.assertion(tokenController.lockReason(firstMember, '0'));
  });
});
