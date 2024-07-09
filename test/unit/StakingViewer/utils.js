const { ethers } = require('hardhat');

const ONE_DAY_SECONDS = 24 * 60 * 60;

async function calculateCurrentTrancheId() {
  const lastBlock = await ethers.provider.getBlock('latest');
  return Math.floor(lastBlock.timestamp / (91 * ONE_DAY_SECONDS));
}

module.exports = { calculateCurrentTrancheId };
