const setup = require('./setup');
const snapshot = require('../utils').snapshot;

describe('PooledStaking unit tests', function () {

  this.timeout(0);
  this.slow(2000);

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  require('./updateUintParameters');
  require('./depositAndStake');
  require('./withdraw');
  require('./withdrawReward');
  require('./requestUnstake');
  require('./processFirstUnstakeRequest');
  require('./pushBurn');
  require('./processBurn');
  require('./pushReward');
  require('./processFirstReward');
  require('./getters');
});
