const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe.only('SwapOperator unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  // include your unit tests here
  require('./placeOrder');
  require('./closeOrder');
  require('./swapEnzymeVaultShareForETH');
  require('./swapETHForEnzymeVaultShare');
  require('./recoverAsset');
});
