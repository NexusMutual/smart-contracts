const { expectRevert } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { internalContracts: [internal] } = require('../utils').accounts;

describe('markCoverClaimOpen/Close', function () {

  it('reverts when called by non-internal contract', async function () {
    await expectRevert.unspecified(this.tokenController.markCoverClaimOpen('1'));
    await expectRevert.unspecified(this.tokenController.markCoverClaimClosed('1', false));
  });

  it('marks claim open and increments claim count', async function () {

    const { tokenController } = this;
    await tokenController.markCoverClaimOpen('1', { from: internal });
    const coverInfo = await tokenController.coverInfo('1');

    assert.strictEqual(coverInfo.claimCount.toString(), '1');
    assert.strictEqual(coverInfo.hasOpenClaim, true);
    assert.strictEqual(coverInfo.hasAcceptedClaim, false);
  });

  it('marks claim closed and denied', async function () {

    const { tokenController } = this;
    await tokenController.markCoverClaimOpen('1', { from: internal });
    await tokenController.markCoverClaimClosed('1', false, { from: internal });
    const coverInfo = await tokenController.coverInfo('1');

    assert.strictEqual(coverInfo.claimCount.toString(), '1');
    assert.strictEqual(coverInfo.hasOpenClaim, false);
    assert.strictEqual(coverInfo.hasAcceptedClaim, false);
  });

  it('reverts when attempting to open a claim on a cover with a pending claim', async function () {

    const { tokenController } = this;
    await tokenController.markCoverClaimOpen('1', { from: internal });

    await expectRevert(
      tokenController.markCoverClaimOpen('1', { from: internal }),
      'TokenController: Cover already has an open claim',
    );
  });

  it('prevents opening a claim when claim count is 2', async function () {

    const { tokenController } = this;
    await tokenController.markCoverClaimOpen('1', { from: internal });
    await tokenController.markCoverClaimClosed('1', false, { from: internal });
    await tokenController.markCoverClaimOpen('1', { from: internal });
    await tokenController.markCoverClaimClosed('1', false, { from: internal });

    await expectRevert(
      tokenController.markCoverClaimOpen('1', { from: internal }),
      'TokenController: Max claim count exceeded',
    );
  });

  it('prevents opening a claim when with an accepted claim', async function () {

    const { tokenController } = this;
    await tokenController.markCoverClaimOpen('1', { from: internal });
    await tokenController.markCoverClaimClosed('1', true, { from: internal });

    await expectRevert(
      tokenController.markCoverClaimOpen('1', { from: internal }),
      'TokenController: Cover already has accepted claims',
    );
  });

  it('prevents marking a claim as closed when there\'s no open claim', async function () {

    const { tokenController } = this;

    await expectRevert(
      tokenController.markCoverClaimClosed('1', false, { from: internal }),
      'TokenController: Cover claim is not marked as open',
    );
  });

});
