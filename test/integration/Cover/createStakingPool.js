const { ethers } = require('hardhat');
const { expect } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { AddressZero } = ethers.constants;

const { parseEther } = ethers.utils;

function calculateTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

const DEFAULT_POOL_FEE = '5';

describe('createStakingPool', function () {
  const period = 3600 * 24 * 30; // 30 days
  const gracePeriod = 3600 * 24 * 30;
  const deposit = parseEther('10');

  beforeEach(async function () {
    const { tk } = this.contracts;

    const members = this.accounts.members.slice(0, 5);
    const amount = parseEther('10000');
    for (const member of members) {
      await tk.connect(this.accounts.defaultSender).transfer(member.address, amount);
    }
  });

  it('should create a private staking pool with an initial deposit', async function () {
    const {
      DEFAULT_PRODUCT_INITIALIZATION,
      contracts: { cover, tk, tc },
    } = this;
    const [manager, staker] = this.accounts.members;
    const lastBlock = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(lastBlock, period, gracePeriod);

    const managerNXMBalanceBefore = await tk.balanceOf(manager.address);
    const tokenControllerBalanceBefore = await tk.balanceOf(tc.address);
    const stakingPoolCountBefore = await cover.stakingPoolCount();

    await cover.connect(manager).createStakingPool(
      manager.address,
      true, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCT_INITIALIZATION,
      deposit, // depositAmount,
      trancheId, // trancheId
    );
    const managerNXMBalanceAfterCreation = await tk.balanceOf(manager.address);
    const tokenControllerBalanceAfterCreation = await tk.balanceOf(tc.address);
    const stakingPoolCountAfter = await cover.stakingPoolCount();

    expect(managerNXMBalanceAfterCreation).to.be.equal(managerNXMBalanceBefore.sub(deposit));
    expect(tokenControllerBalanceAfterCreation).to.be.equal(tokenControllerBalanceBefore.add(deposit));
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const stakingPoolAddress = await cover.stakingPool(stakingPoolCountAfter - 1);
    const stakingPool = await ethers.getContractAt('IntegrationMockStakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalanceBefore = await stakingPool.balanceOf(manager.address);
    assert.equal(managerStakingPoolNFTBalanceBefore.toNumber(), 2);

    await stakingPool.connect(manager).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    const managerNXMBalanceAfterDeposit = await tk.balanceOf(manager.address);
    const tokenControllerBalanceAfterDeposit = await tk.balanceOf(tc.address);
    const managerStakingPoolNFTBalanceAfter = await stakingPool.balanceOf(manager.address);

    expect(managerNXMBalanceAfterDeposit).to.be.equal(managerNXMBalanceAfterCreation.sub(deposit));
    expect(tokenControllerBalanceAfterDeposit).to.be.equal(tokenControllerBalanceAfterCreation.add(deposit));
    expect(managerStakingPoolNFTBalanceAfter).to.be.equal(managerStakingPoolNFTBalanceBefore.add(1));

    await expectRevert(
      stakingPool.connect(staker).depositTo([
        {
          amount: deposit,
          trancheId,
          tokenId: 0, // new position
          destination: AddressZero,
        },
      ]),
      'StakingPool: The pool is private',
    );
  });

  it('should create a public staking pool with an initial deposit', async function () {
    const {
      DEFAULT_PRODUCT_INITIALIZATION,
      contracts: { cover, tk, tc },
    } = this;
    const [manager, staker] = this.accounts.members;
    const lastBlock = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(lastBlock, period, gracePeriod);

    const managerNXMBalanceBefore = await tk.balanceOf(manager.address);
    const tokenControllerBalanceBefore = await tk.balanceOf(tc.address);
    const stakingPoolCountBefore = await cover.stakingPoolCount();

    await cover.connect(manager).createStakingPool(
      manager.address,
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCT_INITIALIZATION,
      deposit, // depositAmount,
      trancheId, // trancheId
    );

    const managerNXMBalanceAfterCreation = await tk.balanceOf(manager.address);
    const tokenControllerBalanceAfterCreation = await tk.balanceOf(tc.address);
    const stakingPoolCountAfter = await cover.stakingPoolCount();

    expect(managerNXMBalanceAfterCreation).to.be.equal(managerNXMBalanceBefore.sub(deposit));
    expect(tokenControllerBalanceAfterCreation).to.be.equal(tokenControllerBalanceBefore.add(deposit));
    expect(stakingPoolCountAfter).to.be.equal(stakingPoolCountBefore.add(1));

    const stakingPoolAddress = await cover.stakingPool(stakingPoolCountAfter - 1);
    const stakingPool = await ethers.getContractAt('IntegrationMockStakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalanceBefore = await stakingPool.balanceOf(manager.address);
    expect(managerStakingPoolNFTBalanceBefore).to.be.equal(2);

    await stakingPool.connect(manager).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    const managerNXMBalanceAfterDeposit = await tk.balanceOf(manager.address);
    const tokenControllerBalanceAfterManagerDeposit = await tk.balanceOf(tc.address);
    const managerStakingPoolNFTBalanceAfter = await stakingPool.balanceOf(manager.address);

    expect(managerNXMBalanceAfterDeposit).to.be.equal(managerNXMBalanceAfterCreation.sub(deposit));
    expect(tokenControllerBalanceAfterManagerDeposit).to.be.equal(tokenControllerBalanceAfterCreation.add(deposit));
    expect(managerStakingPoolNFTBalanceAfter).to.be.equal(managerStakingPoolNFTBalanceBefore.add(1));

    const stakerNXMBalanceBefore = await tk.balanceOf(staker.address);
    await stakingPool.connect(staker).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    const stakerNXMBalanceAfter = await tk.balanceOf(staker.address);
    const tokenControllerBalanceAfterStakerDeposit = await tk.balanceOf(tc.address);
    const stakerStakingPoolNFTBalance = await stakingPool.balanceOf(staker.address);

    expect(stakerNXMBalanceAfter).to.be.equal(stakerNXMBalanceBefore.sub(deposit));
    expect(tokenControllerBalanceAfterStakerDeposit).to.be.equal(
      tokenControllerBalanceAfterManagerDeposit.add(deposit),
    );
    expect(stakerStakingPoolNFTBalance).to.be.equal(1);
  });
});
