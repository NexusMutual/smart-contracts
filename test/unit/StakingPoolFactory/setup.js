const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { reset } = require('../../utils/evm');

async function setup() {
  await reset();
  const accounts = await getAccounts();
  const operator = accounts.nonMembers[0];

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);

  return {
    operator,
    stakingPoolFactory,
    accounts,
  };
}

module.exports = setup;
