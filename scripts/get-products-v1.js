require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const outputDir = path.join(__dirname, 'v2-migration/output');
const getProductsContract = products => `// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IProductsV1.sol";

contract ProductsV1 is IProductsV1 {
  function getNewProductId(address legacyProductId) external pure override returns (uint) {
    ${products
      .map(
        p => `
    // Product: ${p.name}
    // Type: ${p.type}
    if (legacyProductId == ${p.legacyProductId}) {
      return ${p.productId};
    }\n`,
      )
      .join('')}
    revert("Invalid product!");
  }
}
`;

const main = async () => {
  const products = await fetch('https://api.nexusmutual.io/coverables/contracts.json').then(r => r.json());
  // const products =  require(path.join(__dirname, 'v2-migration/input/contracts.json'));
  const sunsetProducts = require(path.join(__dirname, 'v2-migration/output/sunsetProducts.json'));

  console.log(`Total products: ${Object.keys(products).length}`);
  const deprecatedV1Products = Object.keys(products)
    .filter(k => products[k].deprecated)
    .map((k, i) => ({ ...products[k], productId: i, legacyProductId: k }));

  console.log(`Total deprecated products: ${deprecatedV1Products.length}`);

  const productAddresses = Object.keys(products);
  const migrateableAddresses = productAddresses.filter(k => !products[k].deprecated);
  const deprecated = productAddresses.filter(k => products[k].deprecated);

  // add in deprecated products that are not sunset
  migrateableAddresses.push(...deprecated.filter(k => sunsetProducts.indexOf(k) === -1));

  const migratable = migrateableAddresses.map((k, i) => ({ ...products[k], productId: i, legacyProductId: k }));

  console.log(`Total non-sunset products: ${migratable.length}`);

  const ProductsV1 = getProductsContract(migratable);

  const migrateableProductsPath = outputDir + '/migratableProducts.json';
  console.log(`Writing file ${migrateableProductsPath}`);
  fs.writeFileSync(
    migrateableProductsPath,
    JSON.stringify(
      migratable.map(({ name, type, supportedChains, logo, underlyingToken, coveredToken }) => ({
        name,
        type,
        supportedChains,
        logo,
        underlyingToken,
        coveredToken,
      })),
      null,
      2,
    ),
    'utf8',
  );

  const v1ProductIdsPath = outputDir + '/v1ProductIds.json';
  console.log(`Writing file ${v1ProductIdsPath}`);
  fs.writeFileSync(
    v1ProductIdsPath,
    JSON.stringify(
      migratable.map(x => x.legacyProductId),
      null,
      2,
    ),
    'utf8',
  );

  const deprecatedV1ProductsPath = outputDir + '/deprecatedV1Products.json';
  console.log(`Writing file ${deprecatedV1ProductsPath}`);
  fs.writeFileSync(
    deprecatedV1ProductsPath,
    JSON.stringify(
      deprecatedV1Products
        .map(({ name, type, supportedChains, logo, legacyProductId }) => ({
          name,
          type,
          supportedChains,
          logo,
          legacyProductId,
        }))
        .reduce((acc, curr) => {
          acc[curr.legacyProductId] = {
            name: curr.name,
            type: curr.type,
            supportedChains: curr.supportedChains,
            logo: curr.logo,
          };
          return acc;
        }, {}),
      null,
      2,
    ),
    'utf8',
  );

  const contractPath = path.join(__dirname, '../contracts/modules/cover/ProductsV1.sol');
  console.log(`Writing file ${contractPath}`);
  fs.writeFileSync(contractPath, ProductsV1, 'utf8');
};

if (require.main === module) {
  main()
    .then(() => console.log('Done!'))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
