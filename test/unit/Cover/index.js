const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe('Cover unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./burnStake');
  require('./buyCover');
  require('./constructor');
  require('./editCover');
  require('./totalActiveCoverInAsset');
});
