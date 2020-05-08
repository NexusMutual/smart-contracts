describe('PooledStaking', function () {

  // this.timeout(0);
  this.timeout(5000);
  this.slow(2000);

  require('./updateParameter');
  require('./stake');
  require('./unstake');
  require('./withdrawReward');
  require('./requestDeallocation');
  require('./pushBurn');
  require('./getters')
});
