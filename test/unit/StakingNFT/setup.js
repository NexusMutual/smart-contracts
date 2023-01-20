const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const stakingLibrary = await ethers.deployContract('SPMockStakingPoolLibrary');
  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);
  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'NexusMutual Staking',
    'NXMS',
    stakingPoolFactory.address,
    operator.address,
  ]);

  this.stakingPoolLibrary = stakingLibrary;
  this.stakingPoolFactory = stakingPoolFactory;
  this.stakingNFT = stakingNFT;
  this.accounts = accounts;
}

module.exports = setup;
