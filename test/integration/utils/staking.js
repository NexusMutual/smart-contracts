const { ethers } = require('hardhat');
const { AddressZero } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

async function stakeOnly({ stakingPool, staker, period, gracePeriod, trancheIdOffset }) {
  // Staking inputs
  const stakingAmount = parseEther('100');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId + trancheIdOffset,
    0, // new position
    AddressZero, // destination
  );
}

async function stake({ contracts, stakingPool, staker, productId, period, gracePeriod, amount = 0 }) {
  const { stakingProducts } = contracts;

  // Staking inputs
  const stakingAmount = amount !== 0 ? BigNumber.from(amount) : parseEther('10000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    0, // new position
    AddressZero, // destination
  );

  const stakingProductParams = {
    productId,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100, // 1
    setTargetPrice: true,
    targetPrice: 100, // 1%
  };

  // Set staked products
  const managerSigner = await ethers.getSigner(await stakingPool.manager());
  const poolId = await stakingPool.getPoolId();
  await stakingProducts.connect(managerSigner).setProducts(poolId, [stakingProductParams]);
}

module.exports = {
  calculateFirstTrancheId,
  stake,
  stakeOnly,
};
