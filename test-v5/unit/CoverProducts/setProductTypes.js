const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { resultAsObject } = require('../../utils/').results;

const { MaxUint256 } = ethers.constants;
const ipfsMetadata = 'ipfs metadata';

//  coverProducts.ProductType
const ProductTypeTemplate = {
  claimMethod: 0,
  gracePeriod: 30 * 24 * 3600, // 30 days
};

//  coverProducts.ProductTypeParam
const ProductTypeParamTemplate = {
  productTypeName: 'xyz',
  productTypeId: MaxUint256,
  ipfsMetadata,
  productType: { ...ProductTypeTemplate },
};

describe('setProductTypes', function () {
  it('should revert if called by an account not on the advisory board', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [member] = fixture.accounts.members;

    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(coverProducts.connect(member).setProductTypes([productTypeParams])).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should add a new product type', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    expect(await coverProducts.getProductTypeCount()).to.be.equal(1);

    const expectedProductTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    const tx = await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);
    const receipt = await tx.wait();
    const { timestamp } = await ethers.provider.getBlock(receipt.blockNumber);

    const actualProductType = await coverProducts.getProductType(expectedProductTypeId);
    const metadata = await coverProducts.getProductTypeMetadata(expectedProductTypeId);
    const [metadataItem] = metadata;

    expect(await coverProducts.getProductTypeCount()).to.be.equal(2);
    expect(actualProductType.gracePeriod).to.be.equal(ProductTypeTemplate.gracePeriod);
    expect(actualProductType.claimMethod).to.be.equal(ProductTypeTemplate.claimMethod);

    expect(metadata.length).to.be.equal(1);
    expect(metadataItem.ipfsHash).to.be.equal(productTypeParams.ipfsMetadata);
    expect(metadataItem.timestamp).to.be.equal(timestamp);
  });

  it('should emit a ProductTypeSet event when adding a new product type', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    expect(await coverProducts.getProductTypeCount()).to.be.equal(1);

    const expectedProductTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(coverProducts, 'ProductTypeSet')
      .withArgs(expectedProductTypeId);
  });

  it('should revert if product type ipfs hash is empty for new product types', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const productTypeParams = { ...ProductTypeParamTemplate, ipfsMetadata: '' };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'MetadataRequired');
  });

  it('should not update metadata if the ipfs hash is empty', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;
    const productTypeId = 1;

    const initialProductTypeParam = { ...ProductTypeParamTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([initialProductTypeParam]);

    const updatedProductTypeParam = { ...ProductTypeParamTemplate, ipfsMetadata: '', productTypeId };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([updatedProductTypeParam]);

    const metadata = await coverProducts.getProductTypeMetadata(productTypeId);
    expect(metadata.length).to.be.equal(1);

    const [metadataItem] = metadata;
    expect(metadataItem.ipfsHash).to.be.equal(initialProductTypeParam.ipfsMetadata);
  });

  it('should edit gracePeriod and metadata on an existing product', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const productTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const claimMethod = 10;
    const gracePeriod = 10 * 24 * 3600; // 10 days
    const ipfsMetadata = 'new ipfs metadata';
    const productType = { ...ProductTypeTemplate, claimMethod, gracePeriod };
    const updatedProductTypeParam = { ...ProductTypeParamTemplate, productTypeId, ipfsMetadata, productType };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([updatedProductTypeParam]);

    const actualProductType = resultAsObject(await coverProducts.getProductType(productTypeId));
    expect(actualProductType.gracePeriod).to.be.equal(gracePeriod);
    expect(actualProductType.claimMethod).to.be.equal(ProductTypeTemplate.claimMethod);

    const metadata = await coverProducts.getProductTypeMetadata(productTypeId);
    expect(metadata.length).to.be.equal(2);

    const [_unusedInitialMetadata, metadataItem] = metadata;
    expect(metadataItem.ipfsHash).to.be.equal(ipfsMetadata);
  });

  it('should revert if trying to edit a non existing productType', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const productTypeId = 99;
    const productTypeParams = { ...ProductTypeParamTemplate, productTypeId };
    await expect(
      coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductTypeNotFound');
  });

  it('should store product type name for existing productType', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductTypeId = 0;
    const expectedProductTypeName = 'Product Type Test';

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: expectedProductTypeId,
      productTypeName: expectedProductTypeName,
    };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypeName = await coverProducts.getProductTypeName(expectedProductTypeId);
    expect(productTypeName).to.be.equal(expectedProductTypeName);
  });

  it('should emit a ProductTypeSet event when editing a product type', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductTypeId = 0;
    const newProductTypeName = 'Product Type Test';

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: expectedProductTypeId,
      productTypeName: newProductTypeName,
    };

    await expect(coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(coverProducts, 'ProductTypeSet')
      .withArgs(expectedProductTypeId);
  });

  it('should not change productType name for existing productType if passed empty string', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductTypeId = 0;
    const productTypeNameBefore = await coverProducts.getProductTypeName(expectedProductTypeId);

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: expectedProductTypeId,
      productTypeName: '',
    };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypeNameAfter = await coverProducts.getProductTypeName(expectedProductTypeId);
    expect(productTypeNameAfter).to.be.equal(productTypeNameBefore);
  });

  it('should store product type name for new productType', async function () {
    const fixture = await loadFixture(setup);
    const { coverProducts } = fixture;
    const [advisoryBoardMember0] = fixture.accounts.advisoryBoardMembers;

    const expectedProductTypeName = 'Product Type Test';

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: MaxUint256,
      productTypeName: expectedProductTypeName,
    };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypesCount = await coverProducts.getProductTypeCount();
    const productTypeName = await coverProducts.getProductTypeName(productTypesCount.sub(1));
    expect(productTypeName).to.be.equal(expectedProductTypeName);
  });
});
