const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe('Assessment', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./stake');
  require('./unstake');
  require('./withdrawReward');
  require('./castVote');
  require('./submitFraud');
  require('./processFraud');
  require('./updateUintParameters');
});
