const { expect } = require('chai');

describe('migrateCovers', function () {
  it('reverts if system is paused', async function () {
    const { coverMigrator, quotationData, master } = this.contracts;
    const [coverOwner] = this.accounts.members;
    const ETH = '0x45544800';

    // add a new V1 cover
    await quotationData.addCoverMock(
      30,
      100,
      coverOwner.address,
      ETH,
      '0x0000000000000000000000000000000000000001',
      100,
      1000,
    );

    // enable emergency pause
    await master.setEmergencyPause(true);

    await expect(coverMigrator.migrateCovers([1], coverOwner.address)).to.be.revertedWith('System is paused');
  });
});
