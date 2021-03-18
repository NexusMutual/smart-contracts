const { takeSnapshot, revertToSnapshot, reset } = require('../utils').evm;
const setup = require('./setup');

describe('TokenController', function () {

  before(reset);
  before(setup);

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./lockClaimAssessmentTokens');
  require('./extendClaimAssessmentLock');
  require('./removeEmptyReason');
  require('./removeMultipleEmptyReasons');
  require('./markCoverClaim');

});
