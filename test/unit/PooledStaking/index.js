describe('PooledStaking unit tests', function () {

  // this.timeout(0);
  this.timeout(5000);
  this.slow(2000);

  require('./updateParameter');
  require('./depositAndStake');
  require('./withdraw');
  require('./withdrawReward');
  require('./createUnstakeRequest');
  require('./processFirstDeallocation');
  require('./pushBurn');
  require('./processFirstBurn');
  require('./pushReward');
  require('./processFirstReward');
  require('./getters');
});
