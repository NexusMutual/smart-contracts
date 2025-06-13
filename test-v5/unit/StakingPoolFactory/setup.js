const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.nonMembers;

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);

  return {
    operator,
    stakingPoolFactory,
    accounts,
  };
}

module.exports = setup;
