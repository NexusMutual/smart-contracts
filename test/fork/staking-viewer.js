const { abis, addresses } = require('@nexusmutual/deployments');
const { expect } = require('chai');
const { ethers, network } = require('hardhat');

const evm = require('./evm')();

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('StakingViewer', function () {
  const managerAddress = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';

  before(async function () {
    // Initialize evm helper
    await evm.connect(ethers.provider);

    // Get or revert snapshot if network is tenderly
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await evm.revert(TENDERLY_SNAPSHOT_ID);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        console.info('Snapshot ID: ', await evm.snapshot());
      }
    }
    const [deployer] = await ethers.getSigners();
    await evm.setBalance(deployer.address, parseEther('1000'));
  });

  it('load contracts', async function () {
    this.master = await ethers.getContractAt(abis.NXMaster, addresses.NXMaster);
    this.stakingNFT = await ethers.getContractAt(abis.StakingNFT, addresses.StakingNFT);
    this.stakingPoolFactory = await ethers.getContractAt(abis.StakingPoolFactory, addresses.StakingPoolFactory);
  });

  it('deploy StakingViewer', async function () {
    this.stakingViewer = await ethers.deployContract('StakingViewer', [
      this.master.address,
      this.stakingNFT.address,
      this.stakingPoolFactory.address,
    ]);
  });

  it('getManagedStakingPools should return manager pools and rewards', async function () {
    const pools = await this.stakingViewer.getManagedStakingPools(managerAddress);

    pools.forEach(pool => {
      expect(pool.poolId).to.be.instanceOf(BigNumber);
      expect(pool.isPrivatePool).to.be.a('boolean');
      expect(pool.manager).to.equal(managerAddress);
      expect(pool.poolFee).to.be.instanceOf(BigNumber);
      expect(pool.maxPoolFee).to.be.instanceOf(BigNumber);
      expect(pool.activeStake).to.be.instanceOf(BigNumber);
      expect(pool.currentAPY).to.be.instanceOf(BigNumber);
    });
  });

  it('getManagerTokenRewards should return manager pools and rewards', async function () {
    const rewards = await this.stakingViewer.getManagerTokenRewards(managerAddress);

    rewards.forEach(reward => {
      expect(reward.tokenId).to.be.instanceOf(BigNumber);
      expect(reward.poolId).to.be.instanceOf(BigNumber);
      expect(reward.activeStake).to.be.instanceOf(BigNumber);
      expect(reward.expiredStake).to.be.instanceOf(BigNumber);
      expect(reward.rewards).to.be.instanceOf(BigNumber);
      reward.deposits.forEach(deposit => {
        expect(deposit.tokenId).to.be.instanceOf(BigNumber);
        expect(deposit.trancheId).to.be.instanceOf(BigNumber);
        expect(deposit.stake).to.be.instanceOf(BigNumber);
        expect(deposit.stakeShares).to.be.instanceOf(BigNumber);
        expect(deposit.reward).to.be.instanceOf(BigNumber);
      });
    });
  });

  it('getManagerPoolsAndRewards should return manager pools and rewards', async function () {
    const { pools, rewards } = await this.stakingViewer.getManagerPoolsAndRewards(managerAddress);

    pools.forEach(pool => {
      expect(pool.poolId).to.be.instanceOf(BigNumber);
      expect(pool.isPrivatePool).to.be.a('boolean');
      expect(pool.manager).to.equal(managerAddress);
      expect(pool.poolFee).to.be.instanceOf(BigNumber);
      expect(pool.maxPoolFee).to.be.instanceOf(BigNumber);
      expect(pool.activeStake).to.be.instanceOf(BigNumber);
      expect(pool.currentAPY).to.be.instanceOf(BigNumber);
    });

    rewards.forEach(reward => {
      expect(reward.tokenId).to.be.instanceOf(BigNumber);
      expect(reward.poolId).to.be.instanceOf(BigNumber);
      expect(reward.activeStake).to.be.instanceOf(BigNumber);
      expect(reward.expiredStake).to.be.instanceOf(BigNumber);
      expect(reward.rewards).to.be.instanceOf(BigNumber);
      reward.deposits.forEach(deposit => {
        expect(deposit.tokenId).to.be.instanceOf(BigNumber);
        expect(deposit.trancheId).to.be.instanceOf(BigNumber);
        expect(deposit.stake).to.be.instanceOf(BigNumber);
        expect(deposit.stakeShares).to.be.instanceOf(BigNumber);
        expect(deposit.reward).to.be.instanceOf(BigNumber);
      });
    });
  });

  it('processExpirationsFor should process expirations for pools related to the list of tokenIds', async function () {
    const tokenIds = [2, 31, 38, 86];
    try {
      const tx = await this.stakingViewer.processExpirationsFor(tokenIds);
      await tx.wait();
    } catch (e) {
      expect.fail('Expected processExpirationsFor to not throw but it did');
    }
  });
});
