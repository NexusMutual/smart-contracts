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

  const stakingProductParams = {
    productId,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100, // 1
    setTargetPrice: true,
    targetPrice: 100, // 1%
  };

  const managerSigner = await ethers.getSigner(await stakingPool.manager());
  await stakingPool.connect(managerSigner).setProducts([stakingProductParams]);
}

module.exports = {
  calculateFirstTrancheId,
  stake
}
