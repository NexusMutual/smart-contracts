const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;

function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

async function stake({ stakingPool, staker, productId, period, gracePeriod }) {
  // Staking inputs
  const stakingAmount = parseEther('6000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo([
    {
      amount: stakingAmount,
      trancheId: firstTrancheId,
      tokenId: 0, // new position
      destination: AddressZero,
    },
  ]);
  await stakingPool.setTargetWeight(productId, 10);
}

module.exports = {
  calculateFirstTrancheId,
  stake
}
