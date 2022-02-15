const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe.only('Claims', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./submitClaim');
  require('./redeemClaimPayout');
  require('./getAssessmentDepositAndReward');
  require('./updateUintParameters');
  require('./getClaimsToDisplay');
  require('./getClaimsCount');
});
