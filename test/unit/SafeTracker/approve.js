const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('approve', function () {
  it('should emit Approval event if value is 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [member],
    } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).approve(member.address, 100)).to.emit(safeTracker, 'Approval');
  });
});
