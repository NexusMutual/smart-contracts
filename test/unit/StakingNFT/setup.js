const { ethers, accounts } = require('hardhat');

async function setup() {
  const [operator] = accounts.members;

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);
  const cover = await ethers.deployContract('SNFTMockCover', [stakingPoolFactory.address]);
  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');

  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'NexusMutual Staking',
    'NXMS',
    stakingPoolFactory.address,
    cover.address,
    stakingNFTDescriptor.address,
  ]);

  await cover.setStakingNFT(stakingNFT.address);

  this.nftDescriptor = stakingNFTDescriptor;
  this.cover = cover;
  this.stakingPoolFactory = stakingPoolFactory;
  this.stakingNFT = stakingNFT;
  this.accounts = accounts;
}

module.exports = setup;
