describe('UNIT TESTS', function () {

  this.timeout(0);
  this.slow(5000);

  require('./ClaimProofs');
  require('./PooledStaking');
  require('./SwapAgent');
  require('./TwapOracle');

});
