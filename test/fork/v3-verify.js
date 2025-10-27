
it('verify - run before phase 3', async function () {
  // log OLD Pool balances
  // TODO: save old pool balances
  await getPoolBalances(this, addresses.Pool, 'OLD POOL BALANCES');

  // save old product types
  const productTypeCount = await this.coverProducts.getProductTypeCount();

  for (let i = 0; i < productTypeCount; i++) {
    const [claimMethod, gracePeriod, assessmentCooldownPeriod, payoutRedemptionPeriod] =
      await this.coverProducts.getProductType(i);
    const productTypeName = await this.coverProducts.getProductTypeName(i);
    const [ipfsMetadata] = await this.coverProducts.getLatestProductTypeMetadata(i);
    console.log(
      {
        productTypeId: i,
        productTypeName,
        ipfsMetadata,
        claimMethod,
        gracePeriod,
        assessmentCooldownPeriod,
        payoutRedemptionPeriod,
      },
      '\n',
    );
  }
});

it('verify - run after phase 3', async function () {
  // old pool balances should be 0
  await getPoolBalances(this, addresses.Pool, 'OLD POOL BALANCES');

  // new pool balances should be equal to old pool balances before migration
  const [ethBalance, usdcBal, cbBTCBal, rEthBal, stEthBal, enzymeShareBal, safeTrackerBal] = await getPoolBalances(
    this,
    this.pool.target,
    'NEW POOL BALANCES AFTER POOL.MIGRATION',
  );
  // TODO:

  //

  // verify cover IPFS metadata storage
  const { coverIds, ipfsMetadata } = require('../../scripts/v3-migration/data/cover-ipfs-metadata.json');

  this.cover = await ethers.getContractAt('Cover', addresses.Cover);

  for (const [index, coverId] of coverIds.entries()) {
    const coverMetadata = await this.cover.getCoverMetadata(coverId);
    expect(coverMetadata).to.equal(ipfsMetadata[index]);
    console.log(`${coverMetadata} === ${ipfsMetadata[index]}`);
  }
});