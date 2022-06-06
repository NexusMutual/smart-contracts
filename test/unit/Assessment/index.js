const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const { setup } = require('./setup');

describe.only('Assessment', function () {
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./initialize');
  require('./stake');
  require('./unstake');
  require('./getRewards');
  require('./getPoll');
  require('./getAssessmentsCount');
  require('./getVoteCountOfAssessor');
  require('./withdrawRewards');
  require('./withdrawRewardsTo');
  require('./startAssessment');
  require('./castVotes');
  require('./submitFraud');
  require('./processFraud');
  require('./updateUintParameters');
});
