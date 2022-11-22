const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe.only('StakingPool unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  // require('./calculatePrice');
  // require('./interpolatePrice');
  // require('./getPrices');
  require('./constructor');
  require('./initialize');
  require('./setPoolFee');
  require('./setPoolPrivacy');
  require('./calculateNewRewardShares');
  require('./setProducts');
  require('./depositTo');
});
