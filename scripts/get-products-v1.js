require('dotenv').config();
const fs = require('fs');
const path = require('path');

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
  const products = path.join(__dirname, 'v2-migration/input/contracts.json');
  const deprecatedV1Products = Object.keys(products)
    .filter(k => products[k].deprecated)
    .map((k, i) => ({ ...products[k], productId: i, legacyProductId: k }));

  const migratable = Object.keys(products)
    .filter(k => !products[k].deprecated)
    .map((k, i) => ({ ...products[k], productId: i, legacyProductId: k }));

  const ProductsV1 = getProductsContract(migratable);

  fs.writeFileSync(
    outputDir + 'migratableProducts.json',
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

  fs.writeFileSync(
    outputDir + 'v1ProductIds.json',
    JSON.stringify(
      migratable.map(x => x.legacyProductId),
      null,
      2,
    ),
    'utf8',
  );

  fs.writeFileSync(
    outputDir + 'deprecatedV1Products.json',
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
