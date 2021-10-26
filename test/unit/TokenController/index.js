const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe('TokenController', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./removeEmptyReason');
  require('./removeMultipleEmptyReasons');
});
