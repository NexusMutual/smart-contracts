const { ethers } = require('hardhat');
const { BigNumber } = ethers;
const { hex } = require('../utils').helpers;

const MAX_PERCENTAGE_ADJUSTMENT = BigNumber.from('100');

async function initMCR(params) {
  const { mcrValue, desiredMCR, lastUpdateTime, maxMCRIncrement, gearingFactor, minUpdateTime, master } = params;
  const { timestamp: currentTime } = await ethers.provider.getBlock('latest');

  const DisposableMCR = await ethers.getContractFactory('DisposableMCR');
  const MCR = await ethers.getContractFactory('MCR');

  // deploy disposable mcr and initialize values
  const disposableMCR = await DisposableMCR.deploy(
    mcrValue,
    desiredMCR,
    lastUpdateTime || currentTime,
    maxMCRIncrement,
    gearingFactor,
    minUpdateTime,
  );

  const block = await ethers.provider.getBlock('latest');
  const mcrUpdateDeadline = block.timestamp + 30 * 24 * 3600;

  // deploy mcr with fake master
  const mcr = await MCR.deploy(disposableMCR.address, mcrUpdateDeadline);

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
