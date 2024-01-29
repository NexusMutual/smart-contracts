const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

describe('approve', function () {
  it('should revert if amount it greater than 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const { accounts } = fixture;

    await expect(safeTracker.approve(accounts.members[0].address, 100)).to.be.revertedWith('Amount exceeds balance');
  });

  it('should emit Approval event if value is 0', async function () {
    const fixture = await loadFixture(setup);
    const { safeTracker } = fixture.contracts;
    const {
      defaultSender,
      members: [member],
    } = fixture.accounts;

    await expect(safeTracker.connect(defaultSender).approve(member.address, 0)).to.emit(safeTracker, 'Approval');
  });
});
