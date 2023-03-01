const { ethers } = require('hardhat');
const { expect } = require('chai');

const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

function calculateTrancheId(currentTime, period, gracePeriod) {
  return Math.floor((currentTime + period + gracePeriod) / (91 * 24 * 3600));
}

const DEFAULT_POOL_FEE = '5';
const period = 3600 * 24 * 30; // 30 days
const gracePeriod = 3600 * 24 * 30;
const deposit = parseEther('10');

describe('createStakingPool', function () {
  beforeEach(async function () {
    const { tk } = this.contracts;
    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('should create a private staking pool', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, spf, stakingNFT, tc: tokenController } = this.contracts;
    const [manager, staker] = this.accounts.members;

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
    assert.equal(managerStakingPoolNFTBalanceBefore.toNumber(), 0);

    await stakingPool.connect(manager).depositTo(deposit, trancheId, 0, AddressZero);

    const managerStakingPoolNFTBalanceAfter = await stakingNFT.balanceOf(manager.address);
    assert.equal(managerStakingPoolNFTBalanceAfter.toNumber(), 1);

    await expect(
      stakingPool.connect(staker).depositTo(deposit, trancheId, 0, AddressZero), // new deposit
    ).to.be.revertedWithCustomError(stakingPool, 'PrivatePool');

    // check that manager was set in tokenController
    expect(await tokenController.isStakingPoolManager(manager.address)).to.be.equal(true);
    expect(await tokenController.getManagerStakingPools(manager.address)).to.be.deep.equal([stakingPoolCountAfter]);
    expect(await tokenController.getStakingPoolManager(stakingPoolCountAfter)).to.be.equal(manager.address);
  });

  it('should create a public staking pool', async function () {
    const { DEFAULT_PRODUCTS } = this;
    const { cover, spf, stakingNFT, tc: tokenController } = this.contracts;
    const [manager, staker] = this.accounts.members;

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
    const { cover } = this.contracts;
    const [nonMember] = this.accounts.nonMembers;

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
});
