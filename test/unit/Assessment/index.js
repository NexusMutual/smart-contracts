const {takeSnapshot, revertToSnapshot} = require('../utils').evm;
const setup = require('./setup');

describe('Assessment', function () {

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./getPollStatus');

});
