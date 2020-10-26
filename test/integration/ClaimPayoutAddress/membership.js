const { accounts } = require('hardhat');
const { assert } = require('chai');

const [member, payoutAddress] = accounts.slice(4); // skip first four accounts
const switchAddress = '0x1111111111111111111111111111111111111111';

describe('set claim payout address', function () {

  it('should be able to set the claim payout address', async function () {

    const { mr } = this.contracts;

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member),
      member,
      'payout address should be the member address',
    );

    await mr.setClaimPayoutAddress(payoutAddress, { from: member });
    assert.strictEqual(
      await mr.getClaimPayoutAddress(member),
      payoutAddress,
      'should have set the claim payout address',
    );
  });

  it('should clear cpa from the old address when switching membership', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member });
    await tk.approve(mr.address, -1, { from: member });
    await mr.switchMembership(switchAddress, { from: member });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member),
      member,
      'should have been cleared for the old address',
    );
  });

  it('should set cpa on the new address when switching membership', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member });
    await tk.approve(mr.address, -1, { from: member });
    await mr.switchMembership(switchAddress, { from: member });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(switchAddress),
      payoutAddress,
      'should have transfered the claim payout address on the new member address',
    );
  });

  it('should clear the payout address when withdrawing membership', async function () {

    const { mr, tk } = this.contracts;

    await mr.setClaimPayoutAddress(payoutAddress, { from: member });
    await tk.approve(mr.address, -1, { from: member });
    await mr.withdrawMembership({ from: member });

    assert.strictEqual(
      await mr.getClaimPayoutAddress(member),
      member,
      'should have cleared the claim payout address on the old member address',
    );
  });

});
