const { config, network, ethers } = require('hardhat');
const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);
const { BigNumber } = require('ethers');

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  console.log('OWNER ADDRESS', owner.address);

  const targetPrice = BigNumber.from(200);
  const initialPrice = BigNumber.from(200);

  const isPrivatePool = false;
  const initialPoolFee = '5';
  const maxPoolFee = '5';
  const productInitializationParams = [
    {
      productName: 'Product 0',
      productId: 0,
      weight: '40',
      initialPrice,
      targetPrice,
    },
    {
      productName: 'Product 1',
      productId: 1,
      weight: '20',
      initialPrice,
      targetPrice,
    },
    {
      productName: 'Product 73',
      productId: 73, // custodian
      weight: '40',
      initialPrice,
      targetPrice,
    },
  ];

  const cover = await ethers.getContractAt('Cover', Addresses.Cover);

  console.log('Creating 1st staking pool');
  await cover.createStakingPool(
    isPrivatePool,
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    'QmWkJ6euHiAXYkgYFm8paWtU1Ac9apLUu457EZoSy1UE5k', // ipfsDescriptionHash
  );
  console.log('1st staking pool was created.');

  console.log('Creating 2nd staking pool');
  await cover.createStakingPool(
    isPrivatePool,
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    'QmTBP1KxocrLqor4pLR6zRYe8pN9P84zEZrvDDpRANoZ4F', // ipfsDescriptionHash
  );
  console.log('2nd staking pool was created.');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
