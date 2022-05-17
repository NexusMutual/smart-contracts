const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe.only('Cover unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./buyCover');
  require('./editCover');
  require('./createStakingPool');
  require('./getGlobalActiveCoverAmountForAsset');
  // [todo] This test suite is missing
  // require('./performPayoutBurn');
});
