const { ethers } = require('hardhat');
const { expect } = require('chai');
const { resultAsObject } = require('../../utils/').results;
const { MaxUint256 } = ethers.constants;

const ipfsMetadata = 'ipfs metadata';

// Cover.ProductType
const ProductTypeTemplate = {
  claimMethod: 1,
  gracePeriodInDays: 30,
};

// Cover.ProductTypeParam
const ProductTypeParamTemplate = {
  productTypeId: MaxUint256,
  ipfsMetadata,
  productType: { ...ProductTypeTemplate },
};

describe('setProductTypes', function () {
  it('should revert if called by an account not on the advisory board', async function () {
    const { cover } = this;
    const [member] = this.accounts.members;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(cover.connect(member).setProductTypes([productTypeParams])).to.be.revertedWith(
      'Caller is not an advisory board member',
    );
  });

  it('should add a new product type', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(cover.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(cover, 'ProductTypeSet')
      .withArgs(productTypeId, ipfsMetadata);
  });

  it('should edit gracePeriod on an existing product', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 1;
    const productTypeParams = { ...ProductTypeParamTemplate };
    await expect(cover.connect(advisoryBoardMember0).setProductTypes([productTypeParams]))
      .to.emit(cover, 'ProductTypeSet')
      .withArgs(productTypeId, ipfsMetadata);
    {
      const gracePeriodInDays = 10;
      // claim method should not get updated
      const claimMethod = 10;
      const ipfsMetadata = 'new ipfs metadata';
      const productType = { ...ProductTypeTemplate, claimMethod, gracePeriodInDays };
      const productEditParams = { ...ProductTypeParamTemplate, productTypeId, ipfsMetadata, productType };
      await expect(cover.connect(advisoryBoardMember0).setProductTypes([productEditParams]))
        .to.emit(cover, 'ProductTypeSet')
        .withArgs(productTypeId, ipfsMetadata);
      const productTypeActual = resultAsObject(await cover.productTypes(productTypeId));
      expect(productTypeActual.gracePeriodInDays).to.be.equal(gracePeriodInDays);
      expect(productTypeActual.claimMethod).to.be.equal(ProductTypeTemplate.claimMethod);
    }
  });

  it('should revert if trying to edit a non existing productType', async function () {
    const { cover } = this;
    const [advisoryBoardMember0] = this.accounts.advisoryBoardMembers;
    const productTypeId = 99;
    const productTypeParams = { ...ProductTypeParamTemplate, productTypeId };
    await expect(cover.connect(advisoryBoardMember0).setProductTypes([productTypeParams])).to.be.revertedWith(
      'Cover: ProductType doesnt exist. Set id to uint256.max to add it',
    );
  });
});
