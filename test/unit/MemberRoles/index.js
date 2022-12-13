const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe('MemberRoles unit tests', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./join');
  require('./updateRole');
  require('./switchMembership');
  require('./switchMembershipOf');
  require('./withdrawMembership');
  require('./switchMembershipAndAssets');
  require('./swapABMember');
  require('./changeAuthorized');
  require('./stateManagement');
  require('./changeMaxABCount');
});
