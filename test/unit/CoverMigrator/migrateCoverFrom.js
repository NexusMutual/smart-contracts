const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

describe('migrateCovers', function () {
  it('reverts if system is paused', async function () {
    const fixture = await loadFixture(setup);
    const { coverMigrator, master } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(coverMigrator.migrateCovers([1], coverOwner.address)).to.be.revertedWith('System is paused');
  });
});
