const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('initialize', function () {
  it('should set the next claim id correctly', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;
    expect(await claims.getClaimsCount()).to.be.equal(0);
  });

  it('should not be able to call initialize twice', async function () {
    const fixture = await loadFixture(setup);
    const { claims } = fixture.contracts;
    await expect(claims.initialize(10)).to.revertedWithCustomError(claims, 'AlreadyInitialized');
  });
});
