const { expect } = require('chai');

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { yieldTokenIncidents } = this.contracts;
    await expect(yieldTokenIncidents.initialize()).to.be.revertedWith('Already initialized');
  });
});
