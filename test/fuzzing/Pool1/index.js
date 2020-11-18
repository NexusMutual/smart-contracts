const snapshot = require('../../utils').snapshot;

describe('Pool1 comparison unit tests', function () {
  this.timeout(0);
  this.slow(2000);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  require('./buyNXM');
  require('./sellNXM');
  require('./compareTokenCurveImplementations');
});
