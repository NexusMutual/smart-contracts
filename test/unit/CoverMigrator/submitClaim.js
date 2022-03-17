const { expect } = require('chai');

describe('submitClaim', function () {
  it('calls migrateCoverFromOwner with the correct parameters when a legacy coverId is provided as a parameter', async function () {
    const { coverMigrator, cover, distributor } = this.contracts;
    const [coverOwner] = this.accounts.members;

    {
      await coverMigrator.connect(coverOwner).submitClaim(123);
      const migrateCoverFromOwnerCalledWith = await cover.migrateCoverFromOwnerCalledWith();
      expect(migrateCoverFromOwnerCalledWith.coverId).to.be.equal(123);
      expect(migrateCoverFromOwnerCalledWith.fromOwner).to.be.equal(coverOwner.address);
      expect(migrateCoverFromOwnerCalledWith.toNewOwner).to.be.equal(coverOwner.address);
    }

    {
      await coverMigrator.connect(coverOwner).submitClaim(444);
      const migrateCoverFromOwnerCalledWith = await cover.migrateCoverFromOwnerCalledWith();
      expect(migrateCoverFromOwnerCalledWith.coverId).to.be.equal(444);
      expect(migrateCoverFromOwnerCalledWith.fromOwner).to.be.equal(distributor.address);
      expect(migrateCoverFromOwnerCalledWith.toNewOwner).to.be.equal(coverOwner.address);
    }
  });
});
