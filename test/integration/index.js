const { takeSnapshot, revertToSnapshot } = require('./utils').evm;
const setup = require('./setup');

describe('INTEGRATION TESTS', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
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
