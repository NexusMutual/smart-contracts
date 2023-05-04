const { ethers, accounts } = require('hardhat');

async function setup() {
  const [operator] = accounts.members;

  const master = await ethers.deployContract('MasterMock');

  const coverNFTDescriptor = await ethers.deployContract('CoverNFTDescriptor', [master.address]);
  const coverNFT = await ethers.deployContract('CoverNFT', [
    'NexusMutual Cover',
    'NXMC',
    operator.address,
    coverNFTDescriptor.address,
  ]);

  this.coverNFT = coverNFT;
  this.accounts = accounts;
}

module.exports = setup;
