const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const operator = accounts.nonMembers[0];

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);

  this.operator = operator;
  this.stakingPoolFactory = stakingPoolFactory;
  this.accounts = accounts;
}

module.exports = setup;
