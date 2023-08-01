const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe('StakingProducts unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./getEffectiveWeight');
  require('./recalculateEffectiveWeight');
  require('./initializeProducts');
  require('./setProducts');
  require('./createStakingPool');
});
