const { ethers } = require('hardhat');
const { hex } = require('../utils').helpers;

async function setup() {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Cover = await ethers.getContractFactory('CVMockCover');
  const CoverViewer = await ethers.getContractFactory('CoverViewer');

  const master = await MasterMock.deploy();
  const cover = await Cover.deploy();
  const coverViewer = await CoverViewer.deploy(master.address);

  // set contract addresses
  await master.setLatestAddress(hex('CO'), cover.address);

  this.master = master;
  this.cover = cover;
  this.coverViewer = coverViewer;
}

module.exports = setup;
