const { takeSnapshot, revertToSnapshot } = require('./utils').evm;
const setup = require('./setup');

describe.only('INTEGRATION TESTS', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
    console.log(this.snapshotId);
  });

  afterEach(async function () {
    console.log(this.snapshotId);
    try {
      await revertToSnapshot(this.snapshotId);
    } catch (ex) {
      console.log(ex);
    }
  });

  require('./Assessment');
  require('./IndividualClaims');
  require('./YieldTokenIncidents');
  require('./Cover');
  require('./CoverMigrator');
  require('./Master');
  // require('./PooledStaking');
  require('./Pool');
  require('./MCR');
  require('./MemberRoles');
  require('./StakingPool');
  require('./TokenController');
  require('./StakingProducts');
});
