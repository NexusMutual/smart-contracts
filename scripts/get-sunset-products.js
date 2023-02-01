require('dotenv').config();
const fs = require('fs');
const path = require('path');

const gracePeriods = {
  protocol: 30,
  custodian: 120,
  token: 14,
};

const ANCOR = '0xc57d000000000000000000000000000000000001';

/*
  '0xb27f1db0a7e473304a5a06e54bdf035f671400c0',
  '0x11111254369792b2ca5d084ab5eea397ca8fa48b',
  '0xc57d000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000014',
  '0x0000000000000000000000000000000000000013',
  '0x0000000000000000000000000000000000000009',
  '0x0000000000000000000000000000000000000010',
  '0x0000000000000000000000000000000000000017',
  '0xefa94de7a4656d787667c749f7e1223d71e9fd88',
  '0xa51156f3f1e39d1036ca4ba4974107a1c1815d1e',
  '0xd89a09084555a7d0abe7b111b1f78dfeddd638be',
  '0xa4f1671d3aee73c05b552d57f2d16d3cfcbd0217',
  '0x0000000000000000000000000000000000000007'
 */

function getExpiryTime(products, cover) {
  const endDate = new Date(cover.end_time);
  const product = products[cover.address];

  if (!product) {
    return -1;
  }

  const gracePeriod = gracePeriods[product.type];
  if (cover.address === ANCOR) {
    console.log({
      gracePeriod,
      endDate,
    });
  }
  return endDate.getTime(); // + gracePeriod * 24 * 3600 * 1000;
}

const outputDir = path.join(__dirname, 'v2-migration/output');

const main = async () => {
  const covers = require(path.join(__dirname, 'v2-migration/input/covers.json'));
  const products = await fetch('https://api.nexusmutual.io/coverables/contracts.json').then(r => r.json());

  const newestCoverExpiryDatePerProduct = {};

  const productsWithLowerCasedKeys = {};

  for (const key in products) {
    productsWithLowerCasedKeys[key.toLowerCase()] = products[key];
  }
  /*
  {"address": "0xc0a47dfe034b400b47bdad5fecda2621de6c4d95","amount":1.0,"amount_usd":1636.36,"block_number":8667271,"cover_id":84,"currency":"ETH","end_time":"2020-10-02 04:56:05","premium":0.012991101985,"premium_usd":21.2581196441746,"project":"Uniswap v1","start_time":"2019-10-03 04:56:05"},{"address":"0xc0a47dfe034b400b47bdad5fecda2621de6c4d95","amount":12.0,"amount_usd":19636.32,"block_number":8759426,"cover_id":93,"currency":"ETH","end_time":"2020-03-15 15:55:29","premium":0.064065708419,"premium_usd":104.83456262851483,"project":"Uniswap v1","start_time":"2019-10-17 15:55:29"}
   */

  const now = new Date().getTime();

  for (const cover of covers) {
    const expiryTime = getExpiryTime(productsWithLowerCasedKeys, cover);

    if (expiryTime === -1) {
      // product not found
      continue;
    }
    const newestExpiryTime = newestCoverExpiryDatePerProduct[cover.address];

    if (cover.address === ANCOR) {
      console.log({
        newestExpiryTime,
        expiryTime,
      });
    }
    if (newestExpiryTime) {
      newestCoverExpiryDatePerProduct[cover.address] = expiryTime > newestExpiryTime ? expiryTime : newestExpiryTime;
    } else {
      newestCoverExpiryDatePerProduct[cover.address] = expiryTime;
    }
  }

  console.log({
    newestCoverExpiryDatePerProductAncor: new Date(newestCoverExpiryDatePerProduct[ANCOR.toLowerCase()]),
  });

  const sunsetProductKeys = Object.keys(products).filter(p => {
    if (!newestCoverExpiryDatePerProduct[p.toLowerCase()]) {
      return true;
    }
    return newestCoverExpiryDatePerProduct[p.toLowerCase()] < now;
  });

  console.log({
    sunsetProductKeys,
    lastExpiry: newestCoverExpiryDatePerProduct[ANCOR],
    nowTimestamp: now,
    lastExpiryDate: new Date(newestCoverExpiryDatePerProduct[ANCOR]),
    now: new Date(now),
  });

  const sunsetProducts = {};
  sunsetProductKeys.forEach(k => {
    sunsetProducts[k] = products[k];
  });

  const sunsetProductsPath = outputDir + '/sunsetProducts.json';
  console.log(`Writing file ${sunsetProductsPath}`);
  fs.writeFileSync(sunsetProductsPath, JSON.stringify(Object.keys(sunsetProducts)), 'utf8');
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
