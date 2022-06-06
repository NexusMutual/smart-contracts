const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe.only('IndividualClaims', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./initialize');
  require('./submitClaim');
  require('./redeemClaimPayout');
  require('./getAssessmentDepositAndReward');
  require('./updateUintParameters');
  require('./getClaimsToDisplay');
  require('./getClaimsCount');
});
