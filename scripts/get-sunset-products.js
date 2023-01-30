require('dotenv').config();
const fs = require('fs');
const path = require('path');

const gracePeriods = {
  protocol: 30,
  custodian: 90,
  token: 14,
};

function getExpiryTime(products, cover) {
  const endDate = new Date(cover.end_time);
  const product = products[cover.address];
  const gracePeriod = gracePeriods[products.type];
  return endDate.getTime() + gracePeriod * 24 * 3600;
}

const outputDir = path.join(__dirname, 'v2-migration/output');

const main = async () => {
  const covers = require(path.join(__dirname, 'v2-migration/input/covers.json'));
  const products = require(path.join(__dirname, 'v2-migration/input/contracts.json'));

  const newestCoverExpiryDatePerProduct = {};

  /*
  {"address":"0xc0a47dfe034b400b47bdad5fecda2621de6c4d95","amount":1.0,"amount_usd":1636.36,"block_number":8667271,"cover_id":84,"currency":"ETH","end_time":"2020-10-02 04:56:05","premium":0.012991101985,"premium_usd":21.2581196441746,"project":"Uniswap v1","start_time":"2019-10-03 04:56:05"},{"address":"0xc0a47dfe034b400b47bdad5fecda2621de6c4d95","amount":12.0,"amount_usd":19636.32,"block_number":8759426,"cover_id":93,"currency":"ETH","end_time":"2020-03-15 15:55:29","premium":0.064065708419,"premium_usd":104.83456262851483,"project":"Uniswap v1","start_time":"2019-10-17 15:55:29"}
   */

  const now = new Date().getTime();

  for (const cover of covers) {
    const expiryTime = getExpiryTime(products, cover);
    const newestExpiryTime = newestCoverExpiryDatePerProduct[cover.address];
    if (newestExpiryTime) {
      newestCoverExpiryDatePerProduct[cover.address] = expiryTime > newestExpiryTime ? expiryTime : newestExpiryTime;
    } else {
      newestCoverExpiryDatePerProduct[cover.address] = expiryTime;
    }
  }
  const sunsetProductKeys = Object.keys(products).filter(p => {
    return newestCoverExpiryDatePerProduct[p] < now;
  });
  const sunsetProducts = {};
  sunsetProductKeys.forEach(k => {
    sunsetProducts[k] = products[k];
  });

  const sunsetProductsPath = outputDir + '/sunsetProducts.json';
  console.log(`Writing file ${sunsetProductsPath}`);
  fs.writeFileSync(sunsetProductsPath, JSON.stringify(sunsetProducts), 'utf8');
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
