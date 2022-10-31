const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe('Cover unit tests', function () {
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
  require('./totalActiveCoverInAsset');
  require('./performStakeBurn');
  require('./expireCover');
  require('./coverNFT');
  require('./initialize');
  require('./editProductTypes');
  require('./setProducts');
  require('./enableActiveCoverAmountTracking');
  require('./commitActiveCoverAmounts');
});
