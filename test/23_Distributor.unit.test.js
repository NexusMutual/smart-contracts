const { advanceBlock } = require('./utils/advanceToBlock');
const Distributor = artifacts.require('Distributor');

let distributor;

contract('Distributor ', function([owner]) {
  before(async function() {
    await advanceBlock();
    distributor = await Distributor.new();
  });

  describe('buyCover', function() {
    it('calls buyCover succesfully', async function() {});
  });
});
