const { ethers } = require('hardhat');
const { expect } = require('chai');
const { ProposalCategory: PROPOSAL_CATEGORIES } = require('../../lib/constants');
const { setEtherBalance } = require('../utils/evm');
const { parseEther, defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const { V2Addresses, submitGovernanceProposal, getConfig, getProductsInPool } = require('./utils');

const evm = require('./evm')();

async function upgradeMultipleContracts(params) {
  const { codes, addresses } = params;

  const contractCodes = codes.map(code => toUtf8Bytes(code));
  const governance = await ethers.getContractAt('Governance', V2Addresses.Governance);

  const implAddresses = [addresses].map(c => c.address);
  const memberRoles = await ethers.getContractAt('MemberRoles', V2Addresses.MemberRoles);
  const { memberArray: abMembersAddresses } = await memberRoles.members(1);

  // Impersonate and fund advisory board members
  await Promise.all(abMembersAddresses.map(addr => setEtherBalance(addr, parseEther('1000'))));
  const abMembers = await Promise.all(abMembersAddresses.map(addr => ethers.getImpersonatedSigner(addr)));

  await submitGovernanceProposal(
    PROPOSAL_CATEGORIES.upgradeMultipleContracts, // upgradeMultipleContracts(bytes2[],address[])
    defaultAbiCoder.encode(['bytes2[]', 'address[]'], [contractCodes, implAddresses]),
    abMembers,
    governance,
  );
  return abMembers;
}

describe('stakedProductAuthorization', function () {
  before(async function () {
    await evm.connect(ethers.provider);

    const coverProxy = await ethers.getContractAt('Cover', V2Addresses.Cover);
    const stakingPoolImplementation = await coverProxy.stakingPoolImplementation();

    // Deploy new cover contract
    const newCoverImpl = await ethers.deployContract('Cover', [
      V2Addresses.CoverNFT,
      V2Addresses.StakingNFT,
      V2Addresses.StakingPoolFactory,
      stakingPoolImplementation,
    ]);

    this.stakingPoolFactory = await ethers.getContractAt('StakingPoolFactory', V2Addresses.StakingPoolFactory);
    this.cover = coverProxy;
    this.stakingProducts = await ethers.getContractAt('StakingProducts', V2Addresses.StakingProducts);
    this.config = await getConfig.call(this);

    // Submit governance proposal to update cover contract address
    this.abMembers = await upgradeMultipleContracts.call(this, { codes: ['CO'], addresses: newCoverImpl });
  });

  it('should not find any incompatible products in deployed pools', async function () {
    const { cover, stakingPoolFactory } = this;

    const poolCount = await stakingPoolFactory.stakingPoolCount();

    for (let i = 1; i <= poolCount; i++) {
      // get all products in pool
      const products = await getProductsInPool.call(this, { poolId: i });
      console.log('Pool: ', i, ' Number of products: ', products.length);

      // call isPoolAllowed() and assert it returns true
      const allowedResults = await Promise.all(products.map(product => cover.isPoolAllowed(i, product.productId)));
      allowedResults.map(result => expect(result).to.be.true);
    }
  });

  it('should fail to deploy staking pool that uses a forbidden products', async function () {
    const { cover, stakingPoolFactory } = this;
    const [member] = this.abMembers;

    const products = await cover.getProducts();
    const poolCount = await stakingPoolFactory.stakingPoolCount();

    const promises = [];
    for (let i = 0; i < products.length; i++) {
      for (let j = 0; j < poolCount; j++) {
        promises.push(cover.isPoolAllowed(i, j));
      }
    }
    const allowedPools = await Promise.all(promises);
    // const forbiddenProducts = allowedPools.reduce((acc, value, index) => {

    const forbiddenProducts = [];
    for (let i = 0; i < allowedPools.length; i++) {
      if (!allowedPools[i]) {
        forbiddenProducts.push({ productId: i, weight: 5, initialPrice: 1000, targetPrice: 200 });
      }
    }

    // create new staking pool with forbidden products (first product should trigger revert)
    await expect(
      cover.connect(member).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        1000, // maxPoolFee
        forbiddenProducts,
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(forbiddenProducts[0].productId);
  });

  it('should fail to deploy staking pool that uses a non existing product', async function () {
    const { cover } = this;
    const [member] = this.abMembers;

    const nonExistingProduct = { productId: 999999, weight: 10, initialPrice: 100, targetPrice: 200 };

    await expect(
      cover.connect(member).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        1000, // maxPoolFee
        [nonExistingProduct],
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);
  });

  it('should fail to deploy pool with a non existing product, called from pooled staking', async function () {
    const { cover } = this;

    const pooledStakingSigner = await ethers.getImpersonatedSigner(V2Addresses.LegacyPooledStaking);
    await setEtherBalance(V2Addresses.LegacyPooledStaking, parseEther('1000'));

    const nonExistingProduct = { productId: 999999, weight: 10, initialPrice: 100, targetPrice: 200 };

    await expect(
      cover.connect(pooledStakingSigner).createStakingPool(
        true, // isPrivate
        100, // initialPoolFee
        1000, // maxPoolFee
        [nonExistingProduct],
        'ipfs hash',
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);
  });
});
