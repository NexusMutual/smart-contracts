describe('fork tests', function () {
  this.timeout(0);
  this.slow(2000);

  require('./migration-v2');
});
