require('dotenv').config();
const fs = require('node:fs/promises');
const { ethers } = require('hardhat');
const { addresses } = require('@nexusmutual/deployments');

// run command: HARDHAT_NETWORK=mainnet node scripts/migrate-cover-products-metadata.js

const main = async () => {
  const LegacyCover = [
    'event ProductSet(uint256 id, string ipfsMetadata)',
    'event ProductTypeSet(uint256 id, string ipfsMetadata)',
  ];

  const cover = await ethers.getContractAt(LegacyCover, addresses.Cover);
  const coverProducts = await ethers.getContractAt('CoverProducts', ethers.constants.AddressZero);

  const productSetFilter = cover.filters.ProductSet();
  const productTypesFilter = cover.filters.ProductTypeSet();

  const productSetEvents = await cover.queryFilter(productSetFilter, 16792244); // Cover deploy block
  const productTypesEvents = await cover.queryFilter(productTypesFilter, 16792244);

  const latestProductsMetadata = productSetEvents
    .sort((a, b) => a.blockNumber - b.blockNumber)
    .map(({ blockNumber, args }) => ({ id: args.id.toNumber(), ipfsMetadata: args.ipfsMetadata, blockNumber }))
    .reduce((acc, item) => ({ ...acc, [item.id]: item }), {});

  const productsMetadata = Object.values(latestProductsMetadata).filter(event => event.ipfsMetadata !== '');

  const latestProductTypesMetadata = productTypesEvents
    .sort((a, b) => a.blockNumber - b.blockNumber)
    .map(({ blockNumber, args }) => ({ id: args.id.toNumber(), ipfsMetadata: args.ipfsMetadata, blockNumber }))
    .reduce((acc, item) => ({ ...acc, [item.id]: item }), {});

  const productTypesMetadata = Object.values(latestProductTypesMetadata);

  const setProductsMetadataTx = await coverProducts.populateTransaction.setProductsMetadata(
    productsMetadata.map(({ id }) => id),
    productsMetadata.map(({ ipfsMetadata }) => ipfsMetadata),
  );

  const setProductTypesMetadataTx = await coverProducts.populateTransaction.setProductTypesMetadata(
    productTypesMetadata.map(({ id }) => id),
    productTypesMetadata.map(({ ipfsMetadata }) => ipfsMetadata),
  );

  await fs.writeFile('productsMetadata.json', JSON.stringify(productsMetadata, null, 2));
  await fs.writeFile('productTypesMetadata.json', JSON.stringify(productTypesMetadata, null, 2));

  console.log(`Found ${productsMetadata.length} products ipfs hashes`);
  console.log(`Found ${productTypesMetadata.length} product types ipfs hashes`);

  console.log('\nSet products metadata tx:', setProductsMetadataTx.data);
  console.log('\nSet product types metadata tx:', setProductTypesMetadataTx.data);
};

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
