const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const master = await ethers.deployContract('MasterMock');

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.target]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'NexusMutual Cover',
    'NXMC',
    operator.address,
    coverNFTDescriptor.target,
  ]);

  return {
    coverNFT,
    accounts,
  };
}

module.exports = setup;
