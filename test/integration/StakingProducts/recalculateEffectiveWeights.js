const { ethers } = require('hardhat');
const { expect } = require('chai');
const { calculateFirstTrancheId } = require('../utils/staking');
const { MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { daysToSeconds } = require('../../../lib/helpers');

const stakedProductParamTemplate = {
  productId: 1,
  recalculateEffectiveWeight: true,
  setTargetWeight: true,
  targetWeight: 100,
  setTargetPrice: true,
  targetPrice: 100,
};

describe('recalculateEffectiveWeights', function () {
  beforeEach(async function () {
    const { tk: nxm, tc: tokenController } = this.contracts;
    await nxm.approve(tokenController.address, MaxUint256);
  });

  it('recalculates effective weights', async function () {

    const { stakingProducts, stakingPool1 } = this.contracts;
    const staker = this.accounts.defaultSender;
    const [manager1] = this.accounts.stakingPoolManagers;

    const poolId = 1;
    const productId = 1;

    const stakeAmount = parseEther('9000000');

    const targetWeight = 5;

    await stakingProducts.connect(manager1).setProducts(productId, [
      {
        ...stakedProductParamTemplate,
        targetWeight,
      },
    ]);

    // stake
    const firstActiveTrancheId = calculateFirstTrancheId(
      await ethers.provider.getBlock('latest'),
      daysToSeconds(30),
      0,
    );

    await stakingPool1.connect(staker).depositTo(stakeAmount, firstActiveTrancheId + 5, 0, staker.address);

    await stakingProducts.recalculateEffectiveWeightsForAllProducts(poolId);

    const product = await stakingProducts.getProduct(poolId, productId);

    expect(product.lastEffectiveWeight).to.be.equal(targetWeight);
  });
});
