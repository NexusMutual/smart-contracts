const { expect } = require('chai');

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { assessment } = this.contracts;
    await expect(assessment.initialize()).to.be.revertedWith('Already initialized');
  });
});
