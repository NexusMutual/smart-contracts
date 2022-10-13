const { ethers } = require('hardhat');
const { expect } = require('chai');
const { parseEther, toUtf8Bytes } = ethers.utils;

describe('initialize', function () {
  it('reverts when calling migrateCoverFromOwner for a deprecated product', async function () {
    const { coverMigrator, cover, quotationData, productsV1 } = this;
    const [coverOwner] = this.accounts.members;
    const {
      governanceContracts: [gv1],
      members: [coverBuyer],
      advisoryBoardMembers: [advisoryBoardMember0],
    } = this.accounts;

    const legacyProductId = '0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633';
    const productId = await productsV1.getNewProductId(legacyProductId);

    const amount = parseEther('0.0000000000001');
    const targetPriceRatio = '260';
    const priceDenominator = '10000';
    const capacityFactor = '10000';

    await cover.connect(gv1).updateUintParameters([0], [capacityFactor]);
    const expectedPremium = amount.mul(targetPriceRatio).div(priceDenominator);

    await quotationData.addCover(
      100,
      amount,
      coverBuyer.address,
      toUtf8Bytes('NXM0'),
      legacyProductId,
      10,
      expectedPremium,
    );

    await cover.connect(advisoryBoardMember0).deprecateProducts([productId]);
    await expect(coverMigrator.connect(coverOwner).submitClaim(0)).to.be.revertedWith(
      'Product deprecated or not initialized',
    );
  });
});
