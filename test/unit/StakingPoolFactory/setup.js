const { ethers, accounts } = require('hardhat');

async function setup() {
  const operator = accounts.nonMembers[0];

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);

  return {
    operator,
    stakingPoolFactory,
    accounts,
  };
}

module.exports = setup;
