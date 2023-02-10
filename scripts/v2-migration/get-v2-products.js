require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const outputDir = path.join(__dirname, 'output');
const productsV1ContractPath = path.join(__dirname, '../../contracts/modules/cover/ProductsV1.sol');
const CONTRACTS_URL = 'https://api.nexusmutual.io/coverables/contracts.json';

const gracePeriod = {
  protocol: 30,
  custodian: 120,
  token: 14,
};

function getExpiryTime(products, cover) {
  const product = products[cover.address];
  if (!product) {
    console.log(`Product not found for ${cover.address}`);
    return -1;
  }

  // Cover expiration time + grace period
  const endDate = new Date(cover.end_time);
  return endDate.getTime() + gracePeriod[product.type] * 24 * 60 * 60 * 1000;
}

function decode(buf) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buf);
}

const getSunsetProducts = async () => {
  const url = 'https://nexustracker.io/all_covers';
  const covers = JSON.parse(
    decode(await fetch(url, { headers: { 'Content-Type': 'application/json' } }).then(x => x.arrayBuffer())),
  );

  const products = await fetch(CONTRACTS_URL).then(r => r.json());

  const productsWithLowerCasedKeys = {};
  for (const key in products) {
    productsWithLowerCasedKeys[key.toLowerCase()] = products[key];
  }

  const latestCoverExpiryPerProduct = {};
  for (const cover of covers) {
    const expiryTime = getExpiryTime(productsWithLowerCasedKeys, cover);

    if (expiryTime === -1) {
      // product not found
      continue;
    }

    const latestExpiryTime = latestCoverExpiryPerProduct[cover.address];
    if (latestExpiryTime) {
      latestCoverExpiryPerProduct[cover.address] = expiryTime > latestExpiryTime ? expiryTime : latestExpiryTime;
    } else {
      latestCoverExpiryPerProduct[cover.address] = expiryTime;
    }
  }

  const now = new Date().getTime();
  const sunsetProductKeys = Object.keys(products).filter(p => {
    if (!latestCoverExpiryPerProduct[p.toLowerCase()]) {
      return true;
    }
    return latestCoverExpiryPerProduct[p.toLowerCase()] < now;
  });

  return sunsetProductKeys;
};

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
  const v1Products = await fetch(CONTRACTS_URL).then(r => r.json());

  console.log(`Total V1 products: ${Object.keys(v1Products).length}`);

  const v1ProductAddresses = Object.keys(v1Products);
  const v2ProductAddresses = v1ProductAddresses.filter(k => !v1Products[k].deprecated);

  // Add deprecated products that are not sunset
  const deprecatedProductAddresses = v1ProductAddresses.filter(k => v1Products[k].deprecated);
  const sunsetProducts = await getSunsetProducts();
  v2ProductAddresses.push(...deprecatedProductAddresses.filter(k => sunsetProducts.indexOf(k) === -1));

  console.log(`Total V2 products: ${v2ProductAddresses.length}`);

  const v2Products = v2ProductAddresses.map((k, i) => ({ ...v1Products[k], productId: i, legacyProductId: k }));
  const productsV1Contract = getProductsContract(v2Products);

  console.log(`Writing file ${productsV1ContractPath}`);
  fs.writeFileSync(productsV1ContractPath, productsV1Contract, 'utf8');

  const productAddressesPath = outputDir + '/product-addresses.json';
  console.log(`Writing file ${productAddressesPath}`);
  fs.writeFileSync(
    productAddressesPath,
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
