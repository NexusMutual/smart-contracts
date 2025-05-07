const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('setProductsMetadata', function () {
  it('should revert if called by address not on advisory board', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [member] = fixture.accounts.members;
    await expect(coverProducts.connect(member).setProductsMetadata([], [])).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should revert if array lengths differ', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;
    await expect(
      coverProducts.connect(advisoryBoardMember).setProductsMetadata([1, 2], ['']),
    ).to.be.revertedWithCustomError(coverProducts, 'MismatchedArrayLengths');
  });

  it('should revert if the product does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;
    const inexistentProductId = (await coverProducts.getProductCount()).add(7);
    await expect(
      coverProducts.connect(advisoryBoardMember).setProductsMetadata([inexistentProductId], ['']),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductNotFound');
  });

  it('should push new metadata for product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;

    const productId = 1;
    const initialMetadata = await coverProducts.getProductMetadata(productId);

    const tx = await coverProducts.connect(advisoryBoardMember).setProductsMetadata([productId], ['ipfs-hash']);
    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockNumber);

    const updatedMetadata = await coverProducts.getProductMetadata(productId);

    expect(initialMetadata.length).to.equal(1);
    expect(updatedMetadata.length).to.equal(2);

    const metadataItem = updatedMetadata[1];
    expect(metadataItem.ipfsHash).to.equal('ipfs-hash');
    expect(metadataItem.timestamp).to.equal(timestamp);
  });
});
