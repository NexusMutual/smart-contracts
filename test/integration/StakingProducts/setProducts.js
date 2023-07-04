const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
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

describe('setProducts', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
    const { cover } = fixture.contracts;
    const {
      stakingPoolManagers: [manager],
    } = fixture.accounts;

    const initialPoolFee = 50; // 50%
    const maxPoolFee = 80; // 80%

    const [poolId] = await cover.callStatic.createStakingPool(true, initialPoolFee, maxPoolFee, [], '');

    await cover.connect(manager).createStakingPool(
      true, // isPrivatePool,
      initialPoolFee,
      maxPoolFee,
      [],
      '', // ipfsDescriptionHash
    );

    fixture.poolId = poolId;
  });

  it('should be able to raise and lower weights of deprecated products', async function () {
    const { stakingProducts, cover } = fixture.contracts;
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
    await cover.connect(admin).setProducts([coverProductParams]);

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
    const { stakingProducts, cover } = fixture.contracts;
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
    ).to.be.revertedWithCustomError(cover, 'ProductDoesntExist');
  });
});
