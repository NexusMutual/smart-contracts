const { expect } = require('chai');

describe('migrateCovers', function () {
  it('reverts if system is paused', async function () {
    const { coverMigrator, master } = this.contracts;
    const [coverOwner] = this.accounts.members;

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(coverMigrator.migrateCovers([1], coverOwner.address)).to.be.revertedWith('System is paused');
  });
});
