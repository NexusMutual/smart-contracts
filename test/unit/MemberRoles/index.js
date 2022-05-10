const { takeSnapshot, revertToSnapshot } = require('../utils').evm;
const setup = require('./setup');

describe.only('MemberRoles unit tests', function () {
  before(async function () {
    console.log(setup);
    console.log('work');
  });

  beforeEach(async function () {
    this.snapshotId = await takeSnapshot();
  });

  afterEach(async function () {
    await revertToSnapshot(this.snapshotId);
  });

  require('./signUp');
});
