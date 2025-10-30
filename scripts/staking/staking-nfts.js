const { ethers } = require('hardhat');
const { addresses, StakingNFT, StakingPoolFactory } = require('@nexusmutual/deployments');

async function main() {
  const stakingNFT = await ethers.getContractAt(StakingNFT, addresses.StakingNFT);
  const factory = await ethers.getContractAt(StakingPoolFactory, addresses.StakingPoolFactory);

  const poolCount = (await factory.stakingPoolCount()).toNumber();
  const poolIds = new Array(poolCount).fill('').map((_, i) => i + 1);
  const poolTokens = poolIds.reduce((acc, id) => ({ ...acc, [id]: [] }), {});

  const tokenCount = (await stakingNFT.totalSupply()).toNumber();
  const tokenIds = new Array(tokenCount).fill('').map((_, i) => i + 1);

  for (const tokenId of tokenIds) {
    process.stdout.write('.');
    const poolId = (await stakingNFT.stakingPoolOf(tokenId)).toNumber();
    poolTokens[poolId].push(tokenId);
  }

  console.log('\nPool Tokens:');

  for (const poolId of poolIds) {
    console.log(`${poolId}: [${poolTokens[poolId].join(', ')}]`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
