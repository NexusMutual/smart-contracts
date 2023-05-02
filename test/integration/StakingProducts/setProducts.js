const { ethers } = require('hardhat');
const { expect } = require('chai');
const { AddressZero } = ethers.constants;

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 50,
  setTargetPrice: true,
  targetPrice: 500,
};

const coverProductTemplate = {
  productType: 0, // uint16
  yieldTokenAddress: AddressZero,
  coverAssets: 0, // uint32
  initialPriceRatio: 5000, // uint16
  capacityReductionRatio: 0, // uint16
  isDeprecated: false,
  useFixedPrice: false,
};

const coverProductParamTemplate = {
  productName: 'template',
  productId: stakedProductParamTemplate.productId,
  ipfsMetadata: 'ipfsMetadata',
  product: coverProductTemplate,
  allowedPools: [],
};

describe('setProducts', function () {
  it('should be able to raise and lower weights of deprecated products', async function () {
    const { stakingProducts, cover } = this.contracts;
    const {
      defaultSender: admin,
      stakingPoolManagers: [manager1],
    } = this.accounts;

    await stakingProducts.connect(manager1).setProducts(1 /* poolId */, [
      {
        ...stakedProductParamTemplate,
      },
    ]);

    // deprecate product
    const coverProductParams = {
      ...coverProductParamTemplate,
      product: { ...coverProductTemplate, isDeprecated: true },
    };
    await cover.connect(admin).setProducts([coverProductParams]);

    // raise target weight
    await stakingProducts.connect(manager1).setProducts(1 /* poolId */, [
      {
        ...stakedProductParamTemplate,
        targetWeight: 100,
      },
    ]);

    // lower target weight
    await stakingProducts.connect(manager1).setProducts(1 /* poolId */, [
      {
        ...stakedProductParamTemplate,
        targetWeight: 1,
      },
    ]);
  });

  it('should fail to set product that doesnt exist', async function () {
    const { stakingProducts, cover } = this.contracts;
    const {
      stakingPoolManagers: [manager1],
    } = this.accounts;

    const nonExistentProductId = 999999;

    await expect(
      stakingProducts.connect(manager1).setProducts(1 /* poolId */, [
        {
          ...stakedProductParamTemplate,
          productId: nonExistentProductId,
        },
      ]),
    ).to.be.revertedWithCustomError(cover, 'ProductDoesntExist');
  });
});
