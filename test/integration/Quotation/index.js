const { takeSnapshot, revertToSnapshot } = require('../utils').evm;

describe('Quotation integration tests', function () {
  before(async function () {
    this.localSnapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.localSnapshotId);
  });

  after(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./makeCoverUsingNXMTokens');
  require('./expireCover');
  require('./getWithdrawableCoverNoteCoverIds');
});
