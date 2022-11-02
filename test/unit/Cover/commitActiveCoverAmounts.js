const { expect } = require('chai');

describe('commitActiveCoverAmounts', function () {
  it('sets active cover amount commited to true', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    {
      const activeCoverAmountCommitted = await cover.activeCoverAmountCommitted();
      expect(activeCoverAmountCommitted).to.be.equal(false);
    }

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    {
      const activeCoverAmountCommitted = await cover.activeCoverAmountCommitted();
      expect(activeCoverAmountCommitted).to.be.equal(true);
    }
  });

  it('reverts if caller is not emergency admin', async function () {
    const { cover } = this;
    const {
      members: [member],
    } = this.accounts;

    await expect(cover.connect(member).commitActiveCoverAmounts()).to.be.revertedWith('Caller is not emergency admin');
  });

  it('reverts if active cover amounts already committed', async function () {
    const { cover } = this;
    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await expect(cover.connect(emergencyAdmin).commitActiveCoverAmounts()).to.be.revertedWith(
      'Cover: activeCoverAmountCommitted is already true',
    );
  });
});
