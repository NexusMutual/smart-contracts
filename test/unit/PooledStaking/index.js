describe('PooledStaking unit tests', function () {

  // this.timeout(0);
  this.timeout(5000);
  this.slow(2000);

  require('./updateUintParameters');
  require('./depositAndStake');
  require('./withdraw');
  require('./withdrawReward');
  require('./requestUnstake');
  require('./processFirstUnstakeRequest');
  require('./pushBurn');
  require('./processBurn');
  require('./pushReward');
  require('./processFirstReward');
  require('./getters');
});
