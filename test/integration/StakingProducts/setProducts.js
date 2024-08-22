const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
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

async function setProductsSetup() {
  const fixture = await loadFixture(setup);
  const { stakingProducts } = fixture.contracts;
  const {
    stakingPoolManagers: [manager],
  } = fixture.accounts;

  const initialPoolFee = 50; // 50%
  const maxPoolFee = 80; // 80%

  const params = [true /* isPrivatePool */, initialPoolFee, maxPoolFee, [], 'ipfsDescriptionHash'];
  const [poolId] = await stakingProducts.callStatic.createStakingPool(...params);

  await stakingProducts.connect(manager).createStakingPool(...params);

  return {
    ...fixture,
    poolId,
  };
}

describe('setProducts', function () {
  it('should be able to raise and lower weights of deprecated products', async function () {
    const fixture = await loadFixture(setProductsSetup);
    const { stakingProducts, coverProducts } = fixture.contracts;
    const {
      defaultSender: admin,
      stakingPoolManagers: [manager1],
    } = fixture.accounts;

    await stakingProducts.connect(manager1).setProducts(fixture.poolId /* poolId */, [
      {
        ...stakedProductParamTemplate,
      },
    ]);

    // deprecate product
    const coverProductParams = {
      ...coverProductParamTemplate,
      product: { ...coverProductTemplate, isDeprecated: true },
    };
    await coverProducts.connect(admin).setProducts([coverProductParams]);

    // raise target weight
    await stakingProducts.connect(manager1).setProducts(fixture.poolId /* poolId */, [
      {
        ...stakedProductParamTemplate,
        targetWeight: 100,
      },
    ]);

    // lower target weight
    await stakingProducts.connect(manager1).setProducts(fixture.poolId /* poolId */, [
      {
        ...stakedProductParamTemplate,
        targetWeight: 1,
      },
    ]);
  });

  it('should fail to set product that doesnt exist', async function () {
    const fixture = await loadFixture(setProductsSetup);
    const { stakingProducts, coverProducts } = fixture.contracts;
    const {
      stakingPoolManagers: [manager1],
    } = fixture.accounts;

    const nonExistentProductId = 999999;

    await expect(
      stakingProducts.connect(manager1).setProducts(fixture.poolId /* poolId */, [
        {
          ...stakedProductParamTemplate,
          productId: nonExistentProductId,
        },
      ]),
    ).to.be.revertedWithCustomError(coverProducts, 'ProductNotFound');
  });

  it('should fail to set product that is not allowed', async function () {
    const fixture = await loadFixture(setProductsSetup);
    const { stakingProducts, coverProducts } = fixture.contracts;
    const { productList } = fixture;

    const productId = productList.findIndex(product => product.allowedPools.length !== 0);
    const poolId = Array.from({ length: 10 }, (_, i) => i + 1).find(
      id => !productList[productId].allowedPools.includes(id),
    );

    const stakingPoolsManager = fixture.accounts.stakingPoolManagers[poolId - 1];

    await expect(
      stakingProducts.connect(stakingPoolsManager).setProducts(poolId /* poolId */, [
        {
          ...stakedProductParamTemplate,
          productId,
        },
      ]),
    )
      .to.be.revertedWithCustomError(coverProducts, 'PoolNotAllowedForThisProduct')
      .withArgs(productId);
  });
});
