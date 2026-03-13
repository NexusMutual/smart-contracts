const { ethers } = require('hardhat');
const { hex } = require('../../../lib/helpers');

async function setup() {
  const master = await ethers.deployContract('MasterMock');
  const cover = await ethers.deployContract('CVMockCover');
  const coverViewer = await ethers.deployContract('CoverViewer', [master.target]);

  // set contract addresses
  await master.setLatestAddress(hex('CO'), cover.target);

  return {
    master,
    cover,
    coverViewer,
  };
}

module.exports = setup;
