require('dotenv').config();
const fs = require('fs');

const main = async () => {
  const products = JSON.parse(fs.readFileSync('./scripts/contracts.json'));
  const migratable = Object.keys(products)
    .filter(k => !products[k].deprecated)
    .map((k, i) => ({ ...products[k], productId: i, legacyProductId: k }));
  const getProductsContract = x => `// SPDX-License-Identifier: GPL-3.0-only

pragma solidity >=0.5.0;

import "../../interfaces/IProductsV1.sol";

contract ProductsV1 is IProductsV1 {
  function getNewProductId(address legacyProductId) external pure override returns (uint) {
    ${x.join('')}
    revert("Invalid product!");
  }
}
  `;
  const ProductsV1 = getProductsContract(
    migratable.map(
      x => `
    // Product: ${x.name}
    // Type: ${x.type}
    if (legacyProductId == ${x.legacyProductId}) {
      return ${x.productId};
    }
    `,
    ),
  );
  fs.appendFileSync('./scripts/ProductsV1.sol', ProductsV1, 'utf8');
  fs.appendFileSync('./scripts/migratable.json', JSON.stringify(migratable, null, 2), 'utf8');
};

main().catch(e => {
  console.log('Unhandled error encountered: ', e.stack);
  process.exit(1);
});
