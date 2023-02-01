require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const outputDir = path.join(__dirname, 'output');

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
  const v1Products = await fetch('https://api.nexusmutual.io/coverables/contracts.json').then(r => r.json());

  console.log(`Total V1 products: ${Object.keys(v1Products).length}`);

  const v1ProductAddresses = Object.keys(v1Products);
  const v2ProductAddresses = v1ProductAddresses.filter(k => !v1Products[k].deprecated);

  // Add deprecated products that are not sunset
  const deprecatedProductAddresses = v1ProductAddresses.filter(k => v1Products[k].deprecated);
  // TODO move the logic here rather than reading from an output file
  const sunsetProducts = require(path.join(__dirname, 'output/sunsetProducts.json'));
  v2ProductAddresses.push(...deprecatedProductAddresses.filter(k => sunsetProducts.indexOf(k) === -1));

  console.log(`Total V2 products: ${v2ProductAddresses.length}`);

  const v2Products = v2ProductAddresses.map((k, i) => ({ ...v1Products[k], productId: i, legacyProductId: k }));
  const productsV1Contract = getProductsContract(v2Products);

  const productsV1ContractPath = path.join(__dirname, '../../../contracts/modules/cover/ProductsV1.sol');
  console.log(`Writing file ${productsV1ContractPath}`);
  fs.writeFileSync(productsV1ContractPath, productsV1Contract, 'utf8');

  const v2ProductAddressesPath = outputDir + '/v2ProductAddresses.json';
  console.log(`Writing file ${v2ProductAddressesPath}`);
  fs.writeFileSync(
    v2ProductAddressesPath,
    JSON.stringify(
      v2Products.map(x => x.legacyProductId),
      null,
      2,
    ),
    'utf8',
  );
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
