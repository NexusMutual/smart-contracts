const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { V2Addresses, submitGovernanceProposal, getSigner } = require('./utils');
const evm = require('./evm')();
const { verifyPoolWeights } = require('./staking-pool-utils');

describe('recalculateEffectiveWeightsForAllProducts', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);

    // Upgrade StakingProducts
    const stakingProductsImpl = await ethers.deployContract('StakingProducts', [
      V2Addresses.Cover,
      V2Addresses.StakingPoolFactory,
    ]);

    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);
    const abMembers = [];

    for (const address of abMembersAddresses) {
      await evm.impersonate(address);
      await evm.setBalance(address, parseEther('1000'));
      const abSigner = await getSigner(address);
      abMembers.push(abSigner);
    }

    console.log('Upgrading contracts');
    const codes = [toUtf8Bytes('SP')];
    const addresses = [stakingProductsImpl.address];

    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      abMembers,
      governance,
    );
  });

  it('should recalculate effective weight for all products in all pools', async function () {
    const { stakingPoolFactory, stakingProducts } = this;
    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 1; i <= poolCount; i++) {
      await stakingProducts.recalculateEffectiveWeightsForAllProducts(i);
      await verifyPoolWeights(stakingProducts, i);
    }

    // assert values known to be wrong in production
    {
      const HUGH_POOL_ID = 2;
      const binanceProductId = 15;
      const product = await stakingProducts.getProduct(HUGH_POOL_ID, binanceProductId);

      // Note: this assumes Owner hasn't made any changes as agreed
      const targetWeight = await stakingProducts.getProductTargetWeight(HUGH_POOL_ID, binanceProductId);
      expect(product.lastEffectiveWeight).to.be.equal(targetWeight);

      console.log({
        HUGH_POOL_ID,
        targetWeight: targetWeight.toString(),
      });
    }

    {
      const FOUNDATION_POOL_ID = 1;
      const gmxProductId = 38;
      const product = await stakingProducts.getProduct(FOUNDATION_POOL_ID, gmxProductId);

      // Note: this assumes Owner hasn't made any changes as agreed
      const targetWeight = await stakingProducts.getProductTargetWeight(FOUNDATION_POOL_ID, gmxProductId);
      expect(product.lastEffectiveWeight).to.be.equal(targetWeight);

      console.log({
        FOUNDATION_POOL_ID,
        targetWeight: targetWeight.toString(),
      });
    }
  });
});
