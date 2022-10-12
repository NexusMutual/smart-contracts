const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe('MCR unit tests', function () {

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  // parameters
  require('./getMCR');
  require('./getGearedMCR');
  require('./updateMCR');
  require('./updateParameters');

});
