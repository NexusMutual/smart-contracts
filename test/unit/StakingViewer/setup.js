const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');

async function setup() {
  console.log('calling getAccount');
  const accounts = await getAccounts();
  console.log('accounts: ', accounts);
  const master = await ethers.deployContract('MasterMock');
  const stakingNFT = await ethers.deployContract('CoverMockStakingNFT');
  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [accounts.defaultSender.address]);
  const stakingViewer = await ethers.deployContract('StakingViewer', [
    master.address,
    stakingNFT.address,
    stakingPoolFactory.address,
  ]);

  return {
    accounts,
    contracts: {
      master,
      stakingNFT,
      stakingPoolFactory,
      stakingViewer,
    },
  };
}

module.exports = setup;