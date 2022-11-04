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

  require('./constructor');
  require('./buyCover');
  require('./editCover');
  require('./createStakingPool');
  require('./totalActiveCoverInAsset');
  require('./performStakeBurn');
  require('./expireCover');
  require('./coverNFT');
  require('./initialize');
  require('./setProducts');
  require('./setProductTypes');
  require('./enableActiveCoverAmountTracking');
  require('./commitActiveCoverAmounts');
});
