const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe.only('Incidents', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./getPollStatus');
  require('./getPollEndDate');
  require('./submitClaim');
  // require('./submitIncident');
  require('./depositStake');
  // require('./withdrawReward');
  // require('./withdrawStake');
  // require('./redeemClaimPayout');
  // require('./redeemIncidentPayout');
  // require('./castVote');
  // require('./submitFraud');
  // require('./burnFraud');
  // require('./updateUintParameters');
});
