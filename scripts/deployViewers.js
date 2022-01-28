require('dotenv').config();
const { config, network, run, ethers } = require('hardhat');

const { hex } = require('../lib/helpers');
const fs = require('fs');
const { parseUnits } = ethers.utils;

async function main () {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const CoverViewer = await ethers.getContractFactory('CoverViewer');
  const coverViewer = await CoverViewer.deploy('0xa513E6E4b8f2a923D98304ec87F64353C4D5C853');
  await coverViewer.deployed();
  console.log('Address');
  console.log(coverViewer.address);

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
