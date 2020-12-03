const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe('Pool unit tests', function () {

  before(reset);
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
  require('./getMCRRatio');
  require('./getters');

  // pool management
  require('./addAsset');

});
