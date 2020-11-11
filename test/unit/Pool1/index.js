const setup = require('./setup');
const snapshot = require('../utils').snapshot;

describe.only('Pool1 unit tests', function () {

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
  require('./calculateTokenPrice');
  require('./calculateNXMForEth');
  require('./calculateEthForNXM');
  require('./buyNXM');
  require('./sellNXM');
});

describe.only('Pool1 comparison unit tests', function () {
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
