const { takeSnapshot, revertToSnapshot, reset } = require('./utils').evm;
const setup = require('./setup');

describe.only('INTEGRATION TESTS', function () {

  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./Master');
  require('./PooledStaking');
  require('./Pool');
  require('./Quotation');
  require('./MCR');
  require('./MemberRoles');
  require('./Claims');
  require('./Gateway');
  require('./TokenController');

});
