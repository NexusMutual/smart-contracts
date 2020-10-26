const { accounts } = require('hardhat');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');

const [member1, payoutAddress, switchable1, switchable2] = accounts.slice(4); // skip first four accounts
const zeroAddress = '0x0000000000000000000000000000000000000000';

const notEmitted = (receipt, event, args, message) => {
  const cb = () => expectEvent(receipt, event, args);
  assert.throws(cb, message);
};

describe('set claim payout address', function () {

  it('should be able to set the claim payout address', async function () {

    const { mr } = this.contracts;

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      member1,
      'payout address should be the member address',
    );

    const receipt = await mr.setClaimPayoutAddress(payoutAddress, { from: member1 });

    expectEvent(receipt, 'ClaimPayoutAddressSet', {
      member: member1,
      payoutAddress: payoutAddress,
    });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      payoutAddress,
      'should have set the claim payout address',
    );
  });

  it('should clear cpa on the old address & set cpa on the new one when switching membership', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member1 });
    await tk.approve(mr.address, -1, { from: member1 });
    const receipt = await mr.switchMembership(switchable1, { from: member1 });

    expectEvent(receipt, 'ClaimPayoutAddressSet', {
      member: member1,
      payoutAddress: zeroAddress,
    });

    expectEvent(receipt, 'ClaimPayoutAddressSet', {
      member: switchable1,
      payoutAddress: payoutAddress,
    });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      member1,
      'should have been cleared for the old address',
    );

    assert.strictEqual(
      await mr.getClaimPayoutAddress(switchable1),
      payoutAddress,
      'should have transfered the claim payout address to the new member address',
    );
  });

  it('should not allow setting the same address as the membership address', async function () {

    const { mr } = this.contracts;

    await expectRevert(
      mr.setClaimPayoutAddress(member1, { from: member1 }),
      'should be different than the member address',
    );
  });

  it('when switching membership should handle new member eq to payout address case', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(switchable1, { from: member1 });
    await tk.approve(mr.address, -1, { from: member1 });
    const firstSwitchReceipt = await mr.switchMembership(switchable1, { from: member1 });

    expectEvent(firstSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: member1,
      payoutAddress: zeroAddress,
    });

    notEmitted(firstSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable1,
      payoutAddress: zeroAddress,
    });

    notEmitted(firstSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable1,
      payoutAddress: switchable1,
    });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(switchable1),
      switchable1,
      'cpa should be the new membership address',
    );

    await tk.approve(mr.address, -1, { from: switchable1 });
    const secondSwitchReceipt = await mr.switchMembership(switchable2, { from: switchable1 });

    notEmitted(secondSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable1,
      payoutAddress: zeroAddress,
    });

    notEmitted(secondSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable1,
      payoutAddress: switchable1,
    });

    notEmitted(secondSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable2,
      payoutAddress: zeroAddress,
    });

    notEmitted(secondSwitchReceipt, 'ClaimPayoutAddressSet', {
      member: switchable2,
      payoutAddress: switchable2,
    });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(switchable1),
      switchable1,
      'cpa on old address should have been reset',
    );

    assert.strictEqual(
      await mr.getClaimPayoutAddress(switchable2),
      switchable2,
      'cpa should be the same as the membership address',
    );
  });

  it('should reset payout address when setting zero address', async function () {

    const { mr } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member1 });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      payoutAddress,
      'cpa should be the payout address',
    );

    await mr.setClaimPayoutAddress(zeroAddress, { from: member1 });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      member1,
      'cpa should be the member address',
    );
  });

  it('should clear the payout address when withdrawing membership', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member1 });
    await tk.approve(mr.address, -1, { from: member1 });
    const receipt = await mr.withdrawMembership({ from: member1 });

    expectEvent(receipt, 'ClaimPayoutAddressSet', {
      member: member1,
      payoutAddress: zeroAddress,
    });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member1),
      member1,
      'should have cleared the claim payout address on the old member address',
    );
  });

});
