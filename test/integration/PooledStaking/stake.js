const setup = require('../setup');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe.only('stake', function () {

  this.timeout(0);

  beforeEach(setup);

  it('should do nothing', async function () {
    await sleep(2000);
  });

});
