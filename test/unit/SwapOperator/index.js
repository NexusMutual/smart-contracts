const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe('SwapOperator unit tests', function () {

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./swapETHForAsset');
  require('./swapAssetForETH');
  require('./swapETHForStETH');

  describe('TwapOracle', function () {
    require('./consult');
    require('./currentBucketIndex');
    require('./pairFor');
    require('./update');
  });
});
