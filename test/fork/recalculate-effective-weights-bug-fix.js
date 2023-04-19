const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { V2Addresses, UserAddress, submitGovernanceProposal, getConfig } = require('./utils');
const evm = require('./evm')();
const { verifyPoolWeights } = require('./staking-pool-utils');
const NXM_TOKEN_ADDRESS = '0xd7c49CEE7E9188cCa6AD8FF264C1DA2e69D4Cf3B';

describe('recalculateEffectiveWeightsForAllProducts', function () {
  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);
    const hugh = await ethers.getImpersonatedSigner(UserAddress.HUGH);
    await setEtherBalance(hugh.address, parseEther('1000'));

    this.hugh = hugh;

    // Upgrade StakingProducts and Cover
    const codes = ['SP', 'CO'].map(code => toUtf8Bytes(code));
    this.master = await ethers.getContractAt('NXMaster', V2Addresses.NXMaster);
    const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);
    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.stakingProducts = await ethers.getContractAt(
      'StakingProducts',
      await this.master.getLatestAddress(toUtf8Bytes('SP')),
    );
    this.cover = await ethers.getContractAt('Cover', await this.master.getLatestAddress(toUtf8Bytes('CO')));
    this.tokenController = await ethers.getContractAt(
      'TokenController',
      await this.master.getLatestAddress(toUtf8Bytes('TC')),
    );
    this.nxmToken = await ethers.getContractAt('NXMToken', NXM_TOKEN_ADDRESS);

    const stakingProductsImpl = await ethers.deployContract('StakingProducts', [
      this.cover.address,
      this.stakingPoolFactory.address,
    ]);

    const newStakingPoolImpl = await ethers.deployContract('StakingPool', [
      V2Addresses.StakingNFT,
      this.nxmToken.address,
      this.cover.address,
      this.tokenController.address,
      this.master.address,
      this.stakingProducts.address,
    ]);

    const coverImpl = await ethers.deployContract('Cover', [
      V2Addresses.CoverNFT,
      V2Addresses.StakingNFT,
      this.stakingPoolFactory.address,
      newStakingPoolImpl.address,
    ]);

    const stakingPool2 = await ethers.getContractAt('StakingPool', await this.cover.stakingPool(2));

    const addresses = [stakingProductsImpl, coverImpl].map(c => c.address);
    const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
    const { memberArray: abMembersAddresses } = await memberRoles.members(1);

    const abMembers = [];
    for (const address of abMembersAddresses) {
      const abSigner = await ethers.getImpersonatedSigner(address);
      await setEtherBalance(address, parseEther('1000'));
      abMembers.push(abSigner);
    }

    console.log('Upgrading contracts');
    await submitGovernanceProposal(
      PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
      defaultAbiCoder.encode(['bytes2[]', 'address[]'], [codes, addresses]),
      abMembers,
      governance,
    );

    console.log('finished contract upgrade');

    this.stakingPool = stakingPool2;

    this.config = await getConfig.call(this);
  });

  it('should recalculate effective weight for all products in all pools', async function () {
    const { stakingPoolFactory, stakingProducts, config } = this;

    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 1; i <= poolCount; i++) {
      await stakingProducts.recalculateEffectiveWeightsForAllProducts(i);
      await verifyPoolWeights(stakingProducts, i, config);
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
        targetWeight,
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
        targetWeight,
      });
    }
  });
});
