const { artifacts, web3 } = require('hardhat');
const { time } = require('@openzeppelin/test-helpers');
const { hex } = require('../utils').helpers;

const MAX_PERCENTAGE_ADJUSTMENT = web3.utils.toBN(100);

async function initMCR(params) {
  const {
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
  } = params;

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

  const DisposableMCR = artifacts.require('DisposableMCR');
  const MCR = artifacts.require('MCR');

  // deploy disposable mcr and initialize values
  const disposableMCR = await DisposableMCR.new(...mcrParams);

  // deploy mcr with fake master
  const mcr = await MCR.new(disposableMCR.address);

  // trigger initialize and switch master address
  await disposableMCR.initializeNextMcr(mcr.address, master.address);

  // set mcr address on master
  await master.setLatestAddress(hex('MC'), mcr.address);

  return mcr;
}

module.exports = {
  initMCR,
  MAX_PERCENTAGE_ADJUSTMENT,
};
