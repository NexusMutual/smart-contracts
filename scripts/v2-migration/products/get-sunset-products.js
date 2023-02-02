require('dotenv').config();
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

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

const main = async () => {
  const url = 'https://nexustracker.io/all_covers';
  const covers = JSON.parse(
    decode(await fetch(url, { headers: { 'Content-Type': 'application/json' } }).then(x => x.arrayBuffer())),
  );

  const products = await fetch('https://api.nexusmutual.io/coverables/contracts.json').then(r => r.json());

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

  const sunsetProducts = {};
  sunsetProductKeys.forEach(k => {
    sunsetProducts[k] = products[k];
  });

  const sunsetProductsPath = path.join(__dirname, 'output') + '/sunsetProducts.json';
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
