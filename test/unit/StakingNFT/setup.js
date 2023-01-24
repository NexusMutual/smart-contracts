const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);
  const cover = await ethers.deployContract('SNFTMockCover', [stakingPoolFactory.address]);

  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'NexusMutual Staking',
    'NXMS',
    stakingPoolFactory.address,
    cover.address,
  ]);

  this.cover = cover;
  this.stakingPoolFactory = stakingPoolFactory;
  this.stakingNFT = stakingNFT;
  this.accounts = accounts;
}

module.exports = setup;
