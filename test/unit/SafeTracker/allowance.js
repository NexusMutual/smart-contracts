const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('allowance', function () {
  it('should always return 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { accounts } = fixture;
    const [owner, spender] = accounts.members;

    const allowanceBefore = await safeTracker.allowance(owner.address, spender.address);
    expect(allowanceBefore).to.be.equal(0);

    await safeTracker.connect(owner).approve(spender.address, 100);

    const allowanceAfter = await safeTracker.allowance(owner.address, spender.address);
    expect(allowanceAfter).to.be.equal(0);
  });
});
