const { expect } = require('chai');

describe('initialize', function () {
  it('reverts if the contract was already initialized', async function () {
    const { individualClaims } = this.contracts;
    await expect(individualClaims.initialize()).to.be.revertedWith('Already initialized');
  });
});
