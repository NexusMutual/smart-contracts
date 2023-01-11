const { ethers } = require('hardhat');
const { getAccounts } = require('../utils').accounts;

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const CoverNFT = await ethers.getContractFactory('CoverNFT');
  const coverNFT = await CoverNFT.deploy('NexusMutual Cover', 'NXMC', operator.address);

  this.coverNFT = coverNFT;
  this.accounts = accounts;
}

module.exports = setup;
