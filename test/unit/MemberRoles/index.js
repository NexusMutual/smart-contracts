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

  require('./changeAuthorized');
  require('./changeDependentContractAddress');
  require('./changeMaxABCount');
  require('./join');
  require('./stateManagement');
  require('./swapABMember');
  require('./switchMembership');
  require('./switchMembershipAndAssets');
  require('./switchMembershipOf');
  require('./updateRole');
  require('./withdrawMembership');
});
