const { ethers, accounts } = require('hardhat');

async function setup() {
  const operator = accounts.nonMembers[0];

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);

  this.operator = operator;
  this.stakingPoolFactory = stakingPoolFactory;
  this.accounts = accounts;
}

module.exports = setup;
