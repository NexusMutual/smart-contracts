const { config, network, ethers } = require('hardhat');
const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  console.log('OWNER ADDRESS', owner.address);

  const targetPrice = 1000;
  const initialPrice = 10000;

  const isPrivatePool = false;
  const initialPoolFee = '5';
  const maxPoolFee = '5';
  const productInitializationParams = [
    {
      productId: 0,
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
  const cover = await ethers.getContractAt('Cover', Addresses.Cover);

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
