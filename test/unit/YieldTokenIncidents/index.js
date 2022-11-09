const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe('YieldTokenIncidents', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./constructor');
  require('./initialize');
  require('./submitIncident');
  require('./redeemPayout');
  require('./withdrawAsset');
  require('./updateUintParameters');
  require('./getIncidentsCount');
  require('./getIncidentsToDisplay');
});
