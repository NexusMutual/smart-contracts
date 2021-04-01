const { artifacts, web3 } = require('hardhat');
const { ether, time } = require('@openzeppelin/test-helpers');

const { Role } = require('../utils').constants;
const accounts = require('../utils').accounts;
const { hex } = require('../utils').helpers;

const { BN } = web3.utils;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MAX_PERCENTAGE_ADJUSTMENT = new BN(100);

async function initMCR ({
  mcrValue,
  mcrFloor,
  desiredMCR,
  lastUpdateTime,
  mcrFloorIncrementThreshold,
  maxMCRFloorIncrement,
  maxMCRIncrement,
  gearingFactor,
  minUpdateTime,
  master,
}) {

  const latest = await time.latest();
  const mcrParams = [
    mcrValue,
    mcrFloor,
    desiredMCR,
    lastUpdateTime || latest,
    mcrFloorIncrementThreshold,
    maxMCRFloorIncrement,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  ];

  const MCR = artifacts.require('DisposableMCR');
  const mcr = await MCR.new(ZERO_ADDRESS);
  await mcr.initialize(...mcrParams);

  await master.setLatestAddress(hex('MC'), mcr.address);
  return mcr;
}

module.exports = {
  initMCR,
  MAX_PERCENTAGE_ADJUSTMENT,
};
