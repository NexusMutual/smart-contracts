const setup = require('./setup');
const snapshot = require('../utils').snapshot;

describe('Pool1 unit tests', function () {

  this.timeout(0);
  this.slow(2000);

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });
  require('./calculateTokenSpotPrice');
  require('./getTokenPrice');
  require('./calculateNXMForEth');
  require('./calculateEthForNXM');
  require('./getPoolValueInEth');
  require('./buyNXM');
  require('./sellNXM');
  require('./getMCRRatio');
});

describe('Pool1 comparison unit tests', function () {
  this.timeout(0);
  this.slow(2000);

  beforeEach(async function () {
    this.snapshotId = await snapshot.takeSnapshot();
  });

  afterEach(async function () {
    await snapshot.revertToSnapshot(this.snapshotId);
  });

  require('./compareTokenCurveImplementations');
});
