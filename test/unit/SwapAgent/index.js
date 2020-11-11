const setup = require('./setup');
const snapshot = require('../utils').snapshot;

describe('SwapAgent unit tests', function () {

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  require('./addAsset');
});
