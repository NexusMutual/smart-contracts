const setup = require('../setup');

describe('PooledStaking integration tests', function () {

  // this.timeout(0);
  this.timeout(5000);
  this.slow(2000);

  require('./rewardsAndBurns');

});
