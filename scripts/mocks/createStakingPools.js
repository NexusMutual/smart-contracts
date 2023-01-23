const { config, network, ethers } = require('hardhat');

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();

  console.log('OWNER ADDRESS', owner.address);

  const productId = 0;
  const targetPrice = 1000;
  const initialPrice = 10000;

  const isPrivatePool = false;
  const initialPoolFee = '5';
  const maxPoolFee = '5';
  const productInitializationParams = [
    {
      productId,
      weight: '40',
      initialPrice,
      targetPrice,
    },
    {
      productId: 1,
      weight: '20',
      initialPrice,
      targetPrice,
    },
    {
      productId: 73, // custodian
      weight: '40',
      initialPrice,
      targetPrice,
    },
  ];
  const stakingPoolManager = owner;

  const cover = await ethers.getContractAt('Cover', '0x4A679253410272dd5232B3Ff7cF5dbB88f295319');

  console.log('Creating 1st staking pool');
  await cover.createStakingPool(
    stakingPoolManager.address,
    isPrivatePool,
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    '', // ipfsDescriptionHash
  );
  console.log('1st staking pool was created.');

  console.log('Creating 2nd staking pool');
  await cover.createStakingPool(
    stakingPoolManager.address,
    false, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    '', // ipfsDescriptionHash
  );
  console.log('2nd staking pool was created.');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
