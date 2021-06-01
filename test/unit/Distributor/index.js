const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const { setup } = require('./setup');

describe.only('Distributor unit tests', function () {
  before(reset);
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./executeCoverAction');
  require('./buyCover');
});
