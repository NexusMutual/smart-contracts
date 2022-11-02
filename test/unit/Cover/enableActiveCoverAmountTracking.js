const { expect } = require('chai');

describe('enableActiveCoverAmountTracking', function () {
  it('enables cover amount tracking', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    {
      const coverAmountTrackingEnabled = await cover.coverAmountTrackingEnabled();
      expect(coverAmountTrackingEnabled).to.be.equal(false);
    }

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);

    {
      const coverAmountTrackingEnabled = await cover.coverAmountTrackingEnabled();
      expect(coverAmountTrackingEnabled).to.be.equal(true);
    }
  });

  it('sets total active cover for each asset', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    {
      const totalAsset0 = await cover.totalActiveCoverInAsset(0);
      const totalAsset1 = await cover.totalActiveCoverInAsset(1);
      expect(totalAsset0).to.be.equal(0);
      expect(totalAsset1).to.be.equal(0);
    }

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([0, 1], [100, 200]);

    {
      const totalAsset0 = await cover.totalActiveCoverInAsset(0);
      const totalAsset1 = await cover.totalActiveCoverInAsset(1);
      expect(totalAsset0).to.be.equal(100);
      expect(totalAsset1).to.be.equal(200);
    }
  });

  it('can be called multiple times', async function () {
    const { cover } = this;

    const { emergencyAdmin } = this.accounts;

    {
      const totalAsset = await cover.totalActiveCoverInAsset(0);
      expect(totalAsset).to.be.equal(0);
    }

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([0], [100]);

    {
      const totalAsset = await cover.totalActiveCoverInAsset(0);
      expect(totalAsset).to.be.equal(100);
    }

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([0], [200]);

    {
      const totalAsset = await cover.totalActiveCoverInAsset(0);
      expect(totalAsset).to.be.equal(200);
    }

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([0], [100]);

    {
      const totalAsset = await cover.totalActiveCoverInAsset(0);
      expect(totalAsset).to.be.equal(100);
    }
  });

  it('reverts if caller is not emergency admin', async function () {
    const { cover } = this;
    const {
      members: [member],
    } = this.accounts;

    await expect(cover.connect(member).enableActiveCoverAmountTracking([], [])).to.be.revertedWith(
      'Caller is not emergency admin',
    );
  });

  it('reverts if not valid array inputs lengths', async function () {
    const { cover } = this;
    const { emergencyAdmin } = this.accounts;

    await expect(cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([0], [1, 1])).to.be.revertedWith(
      'Cover: Array lengths must not be different',
    );
  });

  it('reverts if active cover amounts already committed', async function () {
    const { cover } = this;
    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], []);
    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    await expect(cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], [])).to.be.revertedWith(
      'Cover: activeCoverAmountCommitted is already true',
    );
  });

  it('reverts if active cover amounts already committed, even if cover tracking was never enabled', async function () {
    const { cover } = this;
    const { emergencyAdmin } = this.accounts;

    await cover.connect(emergencyAdmin).commitActiveCoverAmounts();

    {
      const coverAmountTrackingEnabled = await cover.coverAmountTrackingEnabled();
      expect(coverAmountTrackingEnabled).to.be.equal(false);
    }

    await expect(cover.connect(emergencyAdmin).enableActiveCoverAmountTracking([], [])).to.be.revertedWith(
      'Cover: activeCoverAmountCommitted is already true',
    );
  });
});
