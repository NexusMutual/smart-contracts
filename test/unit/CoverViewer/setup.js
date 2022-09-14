const { ethers } = require('hardhat');
const { hex } = require('../utils').helpers;

async function setup() {
  const MasterMock = await ethers.getContractFactory('MasterMock');
  const Pool = await ethers.getContractFactory('CoverMockPool');
  const Cover = await ethers.getContractFactory('CoverViewerMockCover');
  const CoverViewer = await ethers.getContractFactory('CoverViewer');

  const master = await MasterMock.deploy();
  await master.deployed();

  const pool = await Pool.deploy();

  const cover = await Cover.deploy();

  const coverViewer = await CoverViewer.deploy(master.address);

  // set contract addresses
  await master.setLatestAddress(hex('P1'), pool.address);
  await master.setLatestAddress(hex('CO'), cover.address);

  this.master = master;
  this.pool = pool;
  this.cover = cover;
  this.coverViewer = coverViewer;
}

module.exports = setup;
