const { ethers } = require('hardhat');
const { addresses, Cover, StakingPool } = require('@nexusmutual/deployments');

const { formatEther, formatUnits } = ethers.utils;
const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days
const sum = arr => arr.reduce((a, b) => a.add(b), ethers.constants.Zero);

async function main() {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

  const cover = await ethers.getContractAt(Cover, addresses.Cover);
  const poolId = 22;

  const poolAddress = await cover.stakingPool(poolId);
  const pool = await ethers.getContractAt(StakingPool, poolAddress);
  console.log(`\nPool: ${poolId}`);

  const caches = {};

  const fetchDataAtBlock = async blockTag => {
    if (caches[blockTag]) {
      return caches[blockTag];
    }

    console.log(`Fetching data at block ${blockTag}`);
    const managerRewardShares = [];
    const trancheRewardShares = [];

    const fee = await pool.getPoolFee({ blockTag });
    const rewardShareSupply = await pool.getRewardsSharesSupply({ blockTag });

    const firstActiveTrancheId = (await pool.getFirstActiveTrancheId({ blockTag })).toNumber();
    const activeTrancheCount = currentTrancheId - firstActiveTrancheId + 1;
    const activeTrancheIds = new Array(activeTrancheCount).fill('').map((_, i) => firstActiveTrancheId + i);

    for (const activeTrancheId of activeTrancheIds) {
      const feeDeposit = await pool.getDeposit(0, activeTrancheId, { blockTag });
      managerRewardShares.push(feeDeposit.rewardsShares);

      const { rewardsShares } = await pool.getTranche(activeTrancheId, { blockTag });
      trancheRewardShares.push(rewardsShares);
    }

    const poolManagerRewardShares = sum(managerRewardShares);
    const poolTrancheRewardShares = sum(trancheRewardShares);

    const actualFee = poolTrancheRewardShares.isZero()
      ? ethers.constants.Zero
      : poolManagerRewardShares.mul(10000).div(poolTrancheRewardShares);

    return (caches[blockTag] = {
      poolManagerRewardShares,
      poolTrancheRewardShares,
      rewardShareSupply,
      expectedFee: fee.mul(100),
      actualFee,
      blockTag,
    });
  };

  const printData = async data => {
    const { timestamp } = await ethers.provider.getBlock(data.blockTag);
    console.log(`\nBlock: ${data.blockTag} (${new Date(timestamp * 1000).toISOString()})`);

    console.log(`Manager Reward Shares: ${formatEther(data.poolManagerRewardShares)}`);
    console.log(`Tranche Reward Shares: ${formatEther(data.poolTrancheRewardShares)}`);
    console.log(`Reward Share Supply  : ${formatEther(data.rewardShareSupply)}`);

    console.log(`Actual Fee  : ${formatUnits(data.actualFee, 2)}%`);
    console.log(`Expected Fee: ${formatUnits(data.expectedFee, 2)}%\n`);
  };

  const findLastGood = async (from, to) => {
    // process.stdout.write(`\rSearching ${from} - ${to}`);
    console.log(`Searching ${from} - ${to}`);
    const fromData = await fetchDataAtBlock(from);
    const toData = await fetchDataAtBlock(to);

    if (fromData.actualFee.eq(toData.actualFee)) {
      return { initial: fromData, final: toData };
    }

    const mid = Math.floor((from + to) / 2);

    if (mid === from) {
      return { initial: fromData, final: fromData };
    }

    const midData = await fetchDataAtBlock(mid);

    return midData.actualFee.eq(fromData.actualFee) ? findLastGood(mid, to) : findLastGood(from, mid);
  };

  const blocks = [19533134, 19533135, 19533136, 19533137];
  const data = await Promise.all(blocks.map(block => fetchDataAtBlock(block)));

  for (const d of data) {
    await printData(d);
  }

  process.exit(0);

  const startBlock = 19145833;
  const { number: endBlock } = await ethers.provider.getBlock('latest');
  // const startBlock = 19495597;
  // const endBlock = 19612185;
  let last = startBlock - 1;

  while (last <= endBlock) {
    const { initial, final } = await findLastGood(last + 1, endBlock);
    await printData(initial);

    if (last !== final.blockTag) {
      last = final.blockTag;
      continue;
    }

    await printData(final);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
