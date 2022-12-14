const { expect } = require('chai');

describe('submitClaim', function () {
  it('calls migrateCoverFrom with the correct parameters when a legacy coverId is provided', async function () {
    const { coverMigrator, cover, distributor } = this.contracts;
    const [coverOwner] = this.accounts.members;

    {
      await coverMigrator.connect(coverOwner).submitClaim(123);
      const migrateCoverFromCalledWith = await cover.migrateCoverFromCalledWith();
      expect(migrateCoverFromCalledWith.coverId).to.be.equal(123);
      expect(migrateCoverFromCalledWith.from).to.be.equal(coverOwner.address);
      expect(migrateCoverFromCalledWith.newOwner).to.be.equal(coverOwner.address);
    }

    {
      await distributor.connect(coverOwner).submitClaim(444);
      const migrateCoverFromCalledWith = await cover.migrateCoverFromCalledWith();
      expect(migrateCoverFromCalledWith.coverId).to.be.equal(444);
      expect(migrateCoverFromCalledWith.from).to.be.equal(distributor.address);
      expect(migrateCoverFromCalledWith.newOwner).to.be.equal(coverOwner.address);
    }
  });
});
