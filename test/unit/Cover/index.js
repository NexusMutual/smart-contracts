const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe.only('Cover unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./calculatePrice');
  require('./interpolatePrice');
  require('./buyCover');
  require('./increasePeriodAndReduceAmount');
  require('./increaseAmountAndReducePeriod');
});
