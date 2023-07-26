const { ethers } = require('hardhat');
const { expect } = require('chai');
const { resultAsObject } = require('../../utils/').results;
const { MaxUint256 } = ethers.constants;

const ipfsMetadata = 'ipfs metadata';

//  coverProducts.ProductType
const ProductTypeTemplate = {
  claimMethod: 1,
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
    const { coverProducts } = this;
    const [member] = this.accounts.members;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(coverProducts.connect(member).setProductTypes([productTypeParams])).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should add a new product type', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(coverProducts, 'ProductTypeSet')
      .withArgs(productTypeId, ipfsMetadata);
  });

  it('should edit gracePeriod on an existing product', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect( coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(coverProducts, 'ProductTypeSet')
      .withArgs(productTypeId, ipfsMetadata);
    {
      const gracePeriod = 10 * 24 * 3600; // 10 days
      // claim method should not get updated
      const claimMethod = 10;
      const ipfsMetadata = 'new ipfs metadata';
      const productType = { ...ProductTypeTemplate, claimMethod, gracePeriod };
      const productEditParams = { ...ProductTypeParamTemplate, productTypeId, ipfsMetadata, productType };
      await expect( coverProducts.connect(advisoryBoardMember0).setProductTypes([productEditParams]))
        .to.emit(coverProducts, 'ProductTypeSet')
        .withArgs(productTypeId, ipfsMetadata);
      const productTypeActual = resultAsObject(await  coverProducts.productTypes(productTypeId));
      expect(productTypeActual.gracePeriod).to.be.equal(gracePeriod);
      expect(productTypeActual.claimMethod).to.be.equal(ProductTypeTemplate.claimMethod);
    }
  });

  it('should revert if trying to edit a non existing productType', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 99;
    const productTypeParams = { ...ProductTypeParamTemplate, productTypeId };
    await expect(
       coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductTypeNotFound');
  });

  it('should store product type name for existing productType', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const expectedProductTypeId = 0;
    const expectedProductTypeName = 'Product Type Test';

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: expectedProductTypeId,
      productTypeName: expectedProductTypeName,
    };
    await  coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypeName = await  coverProducts.productTypeNames(expectedProductTypeId);
    expect(productTypeName).to.be.equal(expectedProductTypeName);
  });

  it('should not change productTyype name for existing productType if passed empty string', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const expectedProductTypeId = 0;
    const productTypeNameBefore = await  coverProducts.productTypeNames(expectedProductTypeId);

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: expectedProductTypeId,
      productTypeName: '',
    };
    await  coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypeNameAfter = await  coverProducts.productTypeNames(expectedProductTypeId);
    expect(productTypeNameAfter).to.be.equal(productTypeNameBefore);
  });

  it('should store product type name for new productType', async function () {
    const { coverProducts } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;

    const expectedProductTypeName = 'Product Type Test';

    const productTypeParams = {
      ...ProductTypeParamTemplate,
      productTypeId: MaxUint256,
      productTypeName: expectedProductTypeName,
    };
    await coverProducts.connect(advisoryBoardMember0).setProductTypes([productTypeParams]);

    const productTypesCount = await coverProducts.productTypesCount();
    const productTypeName = await coverProducts.productTypeNames(productTypesCount.sub(1));
    expect(productTypeName).to.be.equal(expectedProductTypeName);
  });
});
