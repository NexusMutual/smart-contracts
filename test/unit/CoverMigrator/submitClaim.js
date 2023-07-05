const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');

const { parseEther } = ethers.utils;

describe('submitClaim', function () {
  it('calls migrateCoverFrom with the correct parameters when a legacy coverId is provided', async function () {
    const fixture = await loadFixture(setup);
    const { coverMigrator, cover, quotationData, tokenController, productsV1, distributor } = fixture.contracts;
    const [coverOwner] = fixture.accounts.members;

    const ETH = '0x45544800';
    const DAI = '0x44414900';

    const coverAssetETH = 0b000;
    const coverAssetDAI = 0b001;

    const period = 30;
    const amount = 100;
    const product = '0x0000000000000000000000000000000000000001';
    const premium = 1;
    const premiumNXM = 10;

    const v2ProductId = await productsV1.getNewProductId(product);

    // cover id 1 & 2
    await quotationData.addV1Cover(period, amount, coverOwner.address, ETH, product, premium, premiumNXM);
    const { timestamp: expectedCoverOneStart } = await ethers.provider.getBlock('latest');
    await tokenController.addCoverInfo(1, 0, false, false);

    await quotationData.addV1Cover(period, amount, distributor.address, DAI, product, premium, premiumNXM);
    const { timestamp: expectedCoverTwoStart } = await ethers.provider.getBlock('latest');
    await tokenController.addCoverInfo(2, 0, false, false);

    await expect(coverMigrator.submitClaim(1)).to.be.revertedWith('Cover can only be migrated by its owner');
    await expect(coverMigrator.submitClaim(2)).to.be.revertedWith('Cover can only be migrated by its owner');

    const submitClaimOneTx = await coverMigrator.connect(coverOwner).submitClaim(1);
    await expect(submitClaimOneTx).to.emit(coverMigrator, 'CoverMigrated').withArgs(
      1, // v1 cover id
      0, // v2 cover id
      coverOwner.address,
    );

    await expect(submitClaimOneTx)
      .to.emit(cover, 'AddLegacyCoverCalledWith')
      .withArgs(
        v2ProductId, // productId
        coverAssetETH, // coverAsset
        parseEther(`${amount}`), // amount
        expectedCoverOneStart, // start
        period * 24 * 3600, // period
        coverOwner.address, // newOwner
      );

    const submitClaimTwoTx = distributor.connect(coverOwner).submitClaim(2);
    await expect(submitClaimTwoTx).to.emit(coverMigrator, 'CoverMigrated').withArgs(
      2, // v1 cover id
      1, // v2 cover id
      coverOwner.address,
    );
    await expect(submitClaimTwoTx)
      .to.emit(cover, 'AddLegacyCoverCalledWith')
      .withArgs(
        v2ProductId, // productId
        coverAssetDAI, // coverAsset
        parseEther(`${amount}`), // amount
        expectedCoverTwoStart, // start
        period * 24 * 3600, // period
        coverOwner.address, // newOwner
      );
  });
});
