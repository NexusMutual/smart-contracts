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

  // parameters
  require('./updateParameters');

  // token price
  require('./calculateTokenSpotPrice');
  require('./getTokenPrice');
  require('./calculateNXMForEth');
  require('./calculateEthForNXM');
  require('./getPoolValueInEth');
  require('./buyNXM');
  require('./sellNXM');
  require('./sellNXMTokens');
  require('./getMCRRatio');
  require('./getters');

  // pool management
  require('./addAsset');
  require('./removeAsset');
  require('./transferAsset');
  require('./upgradeCapitalPool');

  // payout
  require('./sendPayout');

  // swapping
  require('./transferAssetToSwapOperator');
  require('./setSwapDetailsLastSwapTime');
});
