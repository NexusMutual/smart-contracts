const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('allowance', function () {
  it('should always return 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { accounts } = fixture;

    const allowance = await safeTracker.allowance(accounts.members[0].address, accounts.members[1].address);
    expect(allowance).to.be.equal(0);
  });
});
