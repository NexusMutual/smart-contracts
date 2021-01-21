const { assert } = require('chai');

describe('getters', function () {

  describe('getLastMCREther', async function () {

    it('returns MCR as stored by PoolData', async function () {
      const { mcr, pd } = this.contracts;

      const expectedMCR = await pd.getLastMCREther();
      const actualMCR = await mcr.getLastMCREther();
      assert.equal(actualMCR.toString(), expectedMCR.toString(),);
    });
  });
});
