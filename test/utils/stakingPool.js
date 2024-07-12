const { ethers } = require('hardhat');

async function calculateCurrentTrancheId() {
  const lastBlock = await ethers.provider.getBlock('latest');
  return Math.floor(lastBlock.timestamp / (91 * 24 * 3600));
}

module.exports = {
  calculateCurrentTrancheId,
};
