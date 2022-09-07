const { assert } = require('chai');
const { hex } = require('../utils').helpers;

describe('getters', function () {
  describe('getInternalContracts', async function () {
    it('retrieves existing contracts', async function () {
      const { master, governance } = this;

      const { _contractCodes, _contractAddresses } = await master.getInternalContracts();

      assert.equal(_contractCodes.length, 1);
      assert.equal(_contractAddresses.length, 1);
      assert.equal(_contractCodes[0], hex('GV'));
      assert.equal(_contractAddresses[0], governance.address);
    });
  });

  describe('getLatestAddress', async function () {
    it('retrieves existing contracts', async function () {
      const { master, governance } = this;

      const address = await master.getLatestAddress(hex('GV'));

      assert.equal(address, governance.address);
    });
  });
});
