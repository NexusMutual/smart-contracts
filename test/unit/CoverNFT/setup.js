const { ethers } = require('hardhat');
const { getAccounts } = require('../../utils/accounts');
const { reset } = require('../../utils/evm');

async function setup() {
  await reset();
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const master = await ethers.deployContract('MasterMock');

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'NexusMutual Cover',
    'NXMC',
    operator.address,
    coverNFTDescriptor.address,
  ]);

  return {
    coverNFT,
    accounts,
  };
}

module.exports = setup;
