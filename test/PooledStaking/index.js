describe('PooledStaking', function () {

  this.timeout(5000);
  this.slow(2000);

  require('./updateParameter');
  require('./stake');
  require('./setAllocations');
  require('./requestDeallocation');

});
