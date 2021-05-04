const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe('PooledStaking unit tests', function () {

  this.timeout(0);
  before(reset);
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
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
  require('./accumulateReward');

});
