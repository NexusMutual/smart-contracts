describe.only('Gateway integration tests', function () {
  require('./buyCover');
  require('./submitClaim');
  require('./claimTokens');
  require('./getPayoutOutcome');
  require('./getters');
  require('./executeCoverAction');
  require('./membership');
});
