process.on('unhandledRejection', function (err) {
  console.log(err);
  process.exit(1);
});

describe('Nexus Mutual', async function () {
  this.timeout(0);
  this.slow(5000);

  require('./unit');
  require('./integration');
});
