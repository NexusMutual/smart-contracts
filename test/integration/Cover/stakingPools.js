const { ethers } = require('hardhat');
const { expectRevert } = require('@openzeppelin/test-helpers');
const { AddressZero } = ethers.constants;

const { parseEther } = ethers.utils;

function calculateTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

const DEFAULT_POOL_FEE = '5';

describe('Creating Staking Pools with funds', function () {
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

  it('should create a private staking pool', async function () {
    const {
      DEFAULT_PRODUCT_INITIALIZATION,
      contracts: { cover, tk, tc },
    } = this;
    const [manager, staker] = this.accounts.members;
    const lastBlock = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(lastBlock, period, gracePeriod);

    const managerNXMBalance0 = await tk.balanceOf(manager.address);
    const tokenControllerBalance0 = await tk.balanceOf(tc.address);
    const stakingPoolCountBefore = await cover.stakingPoolCount();

    const tx = await cover.connect(manager).createStakingPool(
      manager.address,
      true, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCT_INITIALIZATION,
      deposit, // depositAmount,
      trancheId, // trancheId
    );
    const txResult = await tx.wait();

    const managerNXMBalance1 = await tk.balanceOf(manager.address);
    const tokenControllerBalance1 = await tk.balanceOf(tc.address);
    const stakingPoolCountAfter = await cover.stakingPoolCount();

    assert.equal(managerNXMBalance1.toString(), managerNXMBalance0.sub(deposit).toString());
    assert.equal(tokenControllerBalance1.toString(), tokenControllerBalance0.add(deposit).toString());
    assert.equal(stakingPoolCountAfter.toNumber(), stakingPoolCountBefore.toNumber() + 1);

    const stakingPoolAddress = txResult.events.pop().args.stakingPoolAddress;
    const stakingPool = await ethers.getContractAt('IntegrationMockStakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalance0 = await stakingPool.balanceOf(manager.address);
    assert.equal(managerStakingPoolNFTBalance0.toNumber(), 2);

    const txRestake = await stakingPool.connect(manager).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    await txRestake.wait();

    const managerNXMBalance2 = await tk.balanceOf(manager.address);
    const tokenControllerBalance2 = await tk.balanceOf(tc.address);
    const managerStakingPoolNFTBalance1 = await stakingPool.balanceOf(manager.address);
    assert.equal(managerNXMBalance2.toString(), managerNXMBalance1.sub(deposit).toString());
    assert.equal(tokenControllerBalance2.toString(), tokenControllerBalance1.add(deposit).toString());
    assert.equal(managerStakingPoolNFTBalance1.toNumber(), 3);

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

  it('should create a public staking pool', async function () {
    const {
      DEFAULT_PRODUCT_INITIALIZATION,
      contracts: { cover, tk, tc },
    } = this;
    const [manager, staker] = this.accounts.members;
    const lastBlock = await ethers.provider.getBlock('latest');
    const trancheId = calculateTrancheId(lastBlock, period, gracePeriod);

    const managerNXMBalance0 = await tk.balanceOf(manager.address);
    const tokenControllerBalance0 = await tk.balanceOf(tc.address);
    const stakingPoolCountBefore = await cover.stakingPoolCount();

    const tx = await cover.connect(manager).createStakingPool(
      manager.address,
      false, // isPrivatePool,
      DEFAULT_POOL_FEE, // initialPoolFee
      DEFAULT_POOL_FEE, // maxPoolFee,
      DEFAULT_PRODUCT_INITIALIZATION,
      deposit, // depositAmount,
      trancheId, // trancheId
    );
    const txResult = await tx.wait();

    const managerNXMBalance1 = await tk.balanceOf(manager.address);
    const tokenControllerBalance1 = await tk.balanceOf(tc.address);
    const stakingPoolCountAfter = await cover.stakingPoolCount();

    assert.equal(managerNXMBalance1.toString(), managerNXMBalance0.sub(deposit).toString());
    assert.equal(tokenControllerBalance1.toString(), tokenControllerBalance0.add(deposit).toString());
    assert.equal(stakingPoolCountAfter.toNumber(), stakingPoolCountBefore.toNumber() + 1);

    const stakingPoolAddress = txResult.events.pop().args.stakingPoolAddress;
    const stakingPool = await ethers.getContractAt('IntegrationMockStakingPool', stakingPoolAddress);

    const managerStakingPoolNFTBalance0 = await stakingPool.balanceOf(manager.address);
    assert.equal(managerStakingPoolNFTBalance0.toNumber(), 2);

    const txManagerDeposit = await stakingPool.connect(manager).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    await txManagerDeposit.wait();

    const managerNXMBalance2 = await tk.balanceOf(manager.address);
    const tokenControllerBalance2 = await tk.balanceOf(tc.address);
    const managerStakingPoolNFTBalance1 = await stakingPool.balanceOf(manager.address);
    assert.equal(managerNXMBalance2.toString(), managerNXMBalance1.sub(deposit).toString());
    assert.equal(tokenControllerBalance2.toString(), tokenControllerBalance1.add(deposit).toString());
    assert.equal(managerStakingPoolNFTBalance1.toNumber(), 3);

    const stakerNXMBalance0 = await tk.balanceOf(staker.address);
    const txStakerDeposit = await stakingPool.connect(staker).depositTo([
      {
        amount: deposit,
        trancheId,
        tokenId: 0, // new position
        destination: AddressZero,
      },
    ]);

    await txStakerDeposit.wait();

    const stakerNXMBalance1 = await tk.balanceOf(staker.address);
    const tokenControllerBalance3 = await tk.balanceOf(tc.address);
    const stakerStakingPoolNFTBalance = await stakingPool.balanceOf(staker.address);

    assert.equal(stakerNXMBalance1.toString(), stakerNXMBalance0.sub(deposit).toString());
    assert.equal(tokenControllerBalance3.toString(), tokenControllerBalance2.add(deposit).toString());
    assert.equal(stakerStakingPoolNFTBalance.toNumber(), 1);
  });
});
