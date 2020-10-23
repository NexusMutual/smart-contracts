describe('INTEGRATION TESTS', function () {

  this.timeout(0);
  this.slow(5000);

  require('./ClaimPayoutAddress');
  require('./PooledStaking');

});
