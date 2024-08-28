const { ethers } = require('hardhat');
const { addresses, StakingPool, StakingPoolFactory } = require('@nexusmutual/deployments');

async function main() {
  const factory = await ethers.getContractAt(StakingPoolFactory, addresses.StakingPoolFactory);
  const stakingPoolCount = (await factory.stakingPoolCount()).toNumber();
  const stakingPoolIds = new Array(stakingPoolCount).fill('').map((_, i) => i + 1);
  const cover = await ethers.getContractAt('Cover', addresses.Cover);

  const ipfsHashes = [];

  for (const poolId of stakingPoolIds) {
    const stakingPoolAddress = await cover.stakingPool(poolId);
    const stakingPool = await ethers.getContractAt(StakingPool, stakingPoolAddress);

    const filter = stakingPool.filters.PoolDescriptionSet();
    const events = await stakingPool.queryFilter(filter, 0, 'latest');

    const hash = events.length > 0 ? events[events.length - 1].args.ipfsDescriptionHash : '';
    console.log(`Pool ${poolId}: ${hash}`);

    ipfsHashes.push(hash);
  }

  const encodedData = ethers.utils.defaultAbiCoder.encode(['string[]'], [ipfsHashes]);
  const functionSignature = ethers.utils.id('setInitialMetadata(string[])').slice(0, 10);
  const data = functionSignature + encodedData.slice(2);

  console.log('Tx details:');
  console.log('from: [any ab member]');
  console.log('to:', addresses.StakingProducts);
  console.log('msg.data', data);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
