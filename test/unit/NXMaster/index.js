const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe('Pool unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./upgradeMultipleContracts');
  require('./removeContracts');
  require('./updateOwnerParameters');
  require('./addNewInternalContracts');
  require('./getters');
});
