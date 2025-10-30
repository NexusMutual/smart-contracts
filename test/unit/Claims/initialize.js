const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('initialize', function () {
  it('should set the next claim id correctly', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;
    expect(await claims.getClaimsCount()).to.be.equal(1);
  });

  it('should not be able to call initialize twice', async function () {
    const fixture = await loadFixture(setup);
    const { claims, governance } = fixture.contracts;

    const initialize = claims.connect(governance).initialize(10);
    await expect(initialize).to.revertedWithCustomError(claims, 'AlreadyInitialized');
  });
});
