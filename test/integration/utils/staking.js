const { ethers } = require('hardhat');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));
}

function divCeil(a, b) {
  a = BigNumber.from(a);
  let result = a.div(b);
  if (!a.mod(b).isZero()) {
    result = result.add(1);
  }
  return result;
}

async function stake({ stakingPool, staker, productId, period, gracePeriod }) {
  // Staking inputs
  const stakingAmount = parseEther('10000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    MaxUint256, // new position
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

  const managerSigner = await ethers.getSigner(await stakingPool.manager());
  await stakingPool.connect(managerSigner).setProducts([stakingProductParams]);
}

module.exports = {
  calculateFirstTrancheId,
  stake,
  divCeil,
};
