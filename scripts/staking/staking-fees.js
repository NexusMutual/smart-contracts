const { ethers } = require('hardhat');
const { addresses, Cover, StakingPool, StakingPoolFactory } = require('@nexusmutual/deployments');

const { formatEther, formatUnits } = ethers.utils;
const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days
const sum = arr => arr.reduce((a, b) => a.add(b), ethers.constants.Zero);

async function main() {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

  const cover = await ethers.getContractAt(Cover, addresses.Cover);
  const factory = await ethers.getContractAt(StakingPoolFactory, addresses.StakingPoolFactory);
  const poolCount = (await factory.stakingPoolCount()).toNumber();
  const poolIds = new Array(poolCount).fill('').map((_, i) => i + 1);

  for (const poolId of poolIds) {
    const poolAddress = await cover.stakingPool(poolId);
    const pool = await ethers.getContractAt(StakingPool, poolAddress);
    const fee = await pool.getPoolFee();
    const rewardShareSupply = await pool.getRewardsSharesSupply();

    const managerRewardShares = [];
    const trancheRewardShares = [];

    const firstActiveTrancheId = Math.max(210, (await pool.getFirstActiveTrancheId()).toNumber());
    const activeTrancheCount = currentTrancheId - firstActiveTrancheId + 1 + 8;
    const activeTrancheIds = new Array(activeTrancheCount).fill('').map((_, i) => firstActiveTrancheId + i);

    console.log('currentTrancheId:', currentTrancheId);
    console.log('firstActiveTrancheId:', firstActiveTrancheId);
    console.log('activeTrancheCount:  ', activeTrancheCount);
    console.log('activeTrancheIds:    ', activeTrancheIds);

    for (const activeTrancheId of activeTrancheIds) {
      const feeDeposit = await pool.getDeposit(0, activeTrancheId);
      managerRewardShares.push(feeDeposit.rewardsShares);

      const { rewardsShares } = await pool.getTranche(activeTrancheId);
      trancheRewardShares.push(rewardsShares);
    }

    const poolManagerRewardShares = sum(managerRewardShares);
    const poolTrancheRewardShares = sum(trancheRewardShares);

    console.log(`\nPool: ${poolId}`);
    console.log(`Manager Reward Shares: ${formatEther(poolManagerRewardShares)}`);
    console.log(`Tranche Reward Shares: ${formatEther(poolTrancheRewardShares)}`);
    console.log(`Reward Share Supply  : ${formatEther(rewardShareSupply)}`);

    const actualFee = poolTrancheRewardShares.isZero()
      ? ethers.constants.Zero
      : poolManagerRewardShares.mul(10000).div(poolTrancheRewardShares);

    console.log(`Actual Fee  : ${formatUnits(actualFee, 2)}%`);
    console.log(`Expected Fee: ${formatUnits(fee.mul(100), 2)}%`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
