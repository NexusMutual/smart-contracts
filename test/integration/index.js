const snapshot = require('./utils').snapshot;
const setup = require('./setup');

describe('INTEGRATION TESTS', function () {

  this.timeout(0);
  this.slow(5000);

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  require('./ClaimPayoutAddress');
  require('./PooledStaking');

});
