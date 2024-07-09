const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');

describe('setProductTypesMetadata', function () {
  it('should revert if called by address not on advisory board', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [member] = fixture.accounts.members;
    await expect(coverProducts.connect(member).setProductTypesMetadata([], [])).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should revert if array lengths differ', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;
    await expect(
      coverProducts.connect(advisoryBoardMember).setProductTypesMetadata([1, 2], ['']),
    ).to.be.revertedWithCustomError(coverProducts, 'MismatchedArrayLengths');
  });

  it('should revert if the product does not exist', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;
    const inexistentProductTypeId = (await coverProducts.getProductTypeCount()).add(7);
    await expect(
      coverProducts.connect(advisoryBoardMember).setProductTypesMetadata([inexistentProductTypeId], ['']),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductTypeNotFound');
  });

  it('should revert if the ipfs hash is an empty string', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;
    const productTypeId = 0;
    await expect(
      coverProducts.connect(advisoryBoardMember).setProductTypesMetadata([productTypeId], ['']),
    ).to.be.revertedWithCustomError(coverProducts, 'MetadataRequired');
  });

  it('should push new metadata for product type', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember] = fixture.accounts.advisoryBoardMembers;

    const productTypeId = 0;
    const initialMetadata = await coverProducts.getProductTypeMetadata(productTypeId);

    const tx = await coverProducts.connect(advisoryBoardMember).setProductTypesMetadata([productTypeId], ['ipfs-hash']);
    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockNumber);

    const updatedMetadata = await coverProducts.getProductTypeMetadata(productTypeId);

    expect(initialMetadata.length).to.equal(1);
    expect(updatedMetadata.length).to.equal(2);

    const metadataItem = updatedMetadata[1];
    expect(metadataItem.ipfsHash).to.equal('ipfs-hash');
    expect(metadataItem.timestamp).to.equal(timestamp);
  });
});
