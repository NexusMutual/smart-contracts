const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('approve', function () {
  it('should always revert', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { accounts } = fixture;

    await expect(safeTracker.approve(accounts.members[0].address, 100)).to.be.reverted;
  });
});
