require('dotenv').config();
const { config, network, run, ethers } = require('hardhat');

const { hex } = require('../lib/helpers');
const fs = require('fs');
const { parseUnits } = ethers.utils;

function zeroPadRight (bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

async function main () {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  const cover = await ethers.getContractAt('Cover', '0x610178dA211FEF7D417bC0e6FeD39F05609AD788');

  await cover.createStakingPool(owner.address, false, 0, 0, [], 0, 0);

  await cover.createStakingPool('0x0000000000000000000000000000000000000001', false, 0, 0, [], 0, 0);

  await cover.createStakingPool('0x0000000000000000000000000000000000000002', false, 0, 0, [], 0, 0);

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
