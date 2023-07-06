const { ethers } = require('hardhat');
const { expect } = require('chai');
const { setEtherBalance } = require('../../utils/evm');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

function calculateTrancheId(currentTime, period, gracePeriod) {
  return Math.floor((currentTime + period + gracePeriod) / (91 * 24 * 3600));
}

const DEFAULT_POOL_FEE = BigNumber.from(5);
const period = 3600 * 24 * 30; // 30 days
const gracePeriod = 3600 * 24 * 30;
const deposit = parseEther('10');

async function createStakingPoolSetup() {
  const fixture = await setup();
  const { tk } = fixture.contracts;
  const members = fixture.accounts.members.slice(0, 5);
  const amount = parseEther('10000');
  for (const member of members) {
    await tk.connect(fixture.accounts.defaultSender).transfer(member.address, amount);
  }
  return fixture;
}

describe('createStakingPool', function () {
  it('should create a private staking pool', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { cover, spf, stakingNFT, tc: tokenController } = fixture.contracts;
    const [manager, staker] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(timestamp, period, gracePeriod);
    const stakingPoolCountBefore = await spf.stakingPoolCount();

    await cover.connect(manager).createStakingPool(
      true, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCTS,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await spf.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const stakingPoolAddress = await cover.stakingPool(stakingPoolCountAfter);
    const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalanceBefore = await stakingNFT.balanceOf(manager.address);
    expect(managerStakingPoolNFTBalanceBefore).to.be.equal(0);

    await stakingPool.connect(manager).depositTo(deposit, trancheId, 0, AddressZero);

    const managerStakingPoolNFTBalanceAfter = await stakingNFT.balanceOf(manager.address);
    expect(managerStakingPoolNFTBalanceAfter).to.be.equal(1);

    await expect(
      stakingPool.connect(staker).depositTo(deposit, trancheId, 0, AddressZero), // new deposit
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');

    // check that manager was set in tokenController
    expect(await tokenController.isStakingPoolManager(manager.address)).to.be.equal(true);
    expect(await tokenController.getManagerStakingPools(manager.address)).to.be.deep.equal([stakingPoolCountAfter]);
    expect(await tokenController.getStakingPoolManager(stakingPoolCountAfter)).to.be.equal(manager.address);
  });

  it('should create a public staking pool', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { DEFAULT_PRODUCTS } = fixture;
    const { cover, spf, stakingNFT, tc: tokenController } = fixture.contracts;
    const [manager, staker] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(timestamp, period, gracePeriod);

    const stakingPoolCountBefore = await spf.stakingPoolCount();

    await cover.connect(manager).createStakingPool(
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCTS,
      '', // ipfsDescriptionHash
    );

    const stakingPoolCountAfter = await spf.stakingPoolCount();
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const stakingPoolAddress = await cover.stakingPool(stakingPoolCountAfter);
    const stakingPool = await ethers.getContractAt('StakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalanceBefore = await stakingNFT.balanceOf(manager.address);
    expect(managerStakingPoolNFTBalanceBefore).to.be.equal(0);

    await stakingPool.connect(manager).depositTo(deposit, trancheId, 0, AddressZero);

    const managerStakingPoolNFTBalanceAfter = await stakingNFT.balanceOf(manager.address);
    expect(managerStakingPoolNFTBalanceAfter).to.be.equal(1);

    await stakingPool.connect(staker).depositTo(deposit, trancheId, 0, AddressZero);

    const stakerStakingPoolNFTBalance = await stakingNFT.balanceOf(staker.address);
    expect(stakerStakingPoolNFTBalance).to.be.equal(1);

    // check that manager was set in tokenController
    expect(await tokenController.isStakingPoolManager(manager.address)).to.be.equal(true);
    expect(await tokenController.getManagerStakingPools(manager.address)).to.be.deep.equal([stakingPoolCountAfter]);
    expect(await tokenController.getStakingPoolManager(stakingPoolCountAfter)).to.be.equal(manager.address);
  });

  it('should revert if called by a non member', async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover } = fixture.contracts;
    const [nonMember] = fixture.accounts.nonMembers;

    await expect(
      cover.connect(nonMember).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        [], // products
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it("should fail to create a pool with a product that doesn't exist", async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover } = fixture.contracts;
    const [manager] = fixture.accounts.members;
    const { DEFAULT_PRODUCTS } = fixture;

    const nonExistingProduct = { ...DEFAULT_PRODUCTS[0], productId: 500 };

    await expect(
      cover.connect(manager).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        [nonExistingProduct], // products
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWithCustomError(cover, 'ProductDoesntExistOrIsDeprecated');
  });

  it("should fail to create a pool with a product that doesn't exist, called by pooledStaking", async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover, ps } = fixture.contracts;
    const { DEFAULT_PRODUCTS } = fixture;

    const pooledStakingSigner = await ethers.getImpersonatedSigner(ps.address);
    await setEtherBalance(pooledStakingSigner.address, parseEther('100'));

    const nonExistingProduct = { ...DEFAULT_PRODUCTS[0], productId: 500 };

    await expect(
      cover.connect(pooledStakingSigner).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        [nonExistingProduct], // products
        '', // ipfsDescriptionHash
      ),
    ).to.be.revertedWith('Caller is not a member');
  });

  it("should fail to create a pool with a product that isn't allowed for fixture pool", async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover } = fixture.contracts;
    const [manager] = fixture.accounts.members;
    const { DEFAULT_PRODUCTS } = fixture;

    const notAllowedProduct = { ...DEFAULT_PRODUCTS[0], productId: 4 };

    // get new poolId
    const [newPoolId] = await cover.connect(manager).callStatic.createStakingPool(
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCTS,
      '', // ipfsDescriptionHash
    );

    expect(await cover.isPoolAllowed(notAllowedProduct.productId, newPoolId)).to.be.equal(false);

    await expect(
      cover.connect(manager).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        [notAllowedProduct], // products
        '', // ipfsDescriptionHash
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(notAllowedProduct.productId);
  });

  it("should fail to create a pool with one of several products that isn't allowed for this pool", async function () {
    const fixture = await loadFixture(createStakingPoolSetup);
    const { cover } = fixture.contracts;
    const [manager] = fixture.accounts.members;
    const { DEFAULT_PRODUCTS } = fixture;

    const nonExistingProduct = { ...DEFAULT_PRODUCTS[0], productId: 4 };
    DEFAULT_PRODUCTS.push(nonExistingProduct);

    // get new poolId
    const [newPoolId] = await cover.connect(manager).callStatic.createStakingPool(
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      [],
      '', // ipfsDescriptionHash
    );

    expect(await cover.isPoolAllowed(DEFAULT_PRODUCTS[0].productId, newPoolId)).to.be.equal(true);
    expect(await cover.isPoolAllowed(DEFAULT_PRODUCTS[1].productId, newPoolId)).to.be.equal(false);

    await expect(
      cover.connect(manager).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        DEFAULT_PRODUCTS, // products
        '', // ipfsDescriptionHash
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);

    // deploy pool with first product only
    await cover.connect(manager).createStakingPool(
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      [DEFAULT_PRODUCTS[0]], // products
      '', // ipfsDescriptionHash
    );

    // next pool is allowed to have second product but should fail because it must be allowed after the creation
    expect(newPoolId.add(1)).to.be.equal(7);
    expect(await cover.isPoolAllowed(DEFAULT_PRODUCTS[1].productId, newPoolId.add(1))).to.be.equal(true);
    await expect(
      cover.connect(manager).createStakingPool(
        false, // isPrivatePool,
        DEFAULT_POOL_FEE, // initialPoolFee
        DEFAULT_POOL_FEE, // maxPoolFee,
        DEFAULT_PRODUCTS, // products
        '', // ipfsDescriptionHash
      ),
    )
      .to.be.revertedWithCustomError(cover, 'PoolNotAllowedForThisProduct')
      .withArgs(nonExistingProduct.productId);
  });
});
