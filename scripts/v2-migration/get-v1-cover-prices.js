require('dotenv').config();
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');

// These products are not allowed to be covered in DAI
const DAI_COVER_BLACKLIST = [
  // Maker DAO
  '0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b',
  // Curve sETH LP (eCrv)
  '0x0000000000000000000000000000000000000010',
  // Convex stethCrv (cvxstethCrv)
  '0x0000000000000000000000000000000000000013',
];

const PRODUCT_ADDRESSES = require(path.join(__dirname, 'output/product-addresses.json'));
const PS_CONTRACT_PATH = path.join(__dirname, '../../contracts/modules/legacy/LegacyPooledStaking.sol');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const getPrices = (priceMap, products) => `// {V1_PRICES_HELPER_BEGIN}
${Object.keys(priceMap)
  .map(price => {
    if (priceMap[price].length > 1) {
      return `
    if (
${priceMap[price]
  .map((address, index) => {
    const lineEnd = index < priceMap[price].length - 1 ? ' ||\n' : '';
    const productId = products.findIndex(x => x === address);
    return `      // ${address} 
      id == ${productId}${lineEnd}`;
  })
  .join('')}
    ) {
      return ${price}; // ${price / 1e18} %
    }`;
    }
    const productId = products.findIndex(x => x === priceMap[price][0]);
    return `
    // ${products[productId]} 
    if (id == ${productId}) {
      return ${price}; // ${price / 1e18} %
    }`;
  })
  .join('\n')}
    // {V1_PRICES_HELPER_END}`;

const main = async (useCache = true) => {
  // check the cache first
  if (useCache) {
    console.log('Using cached data for get V1 cover prices');
    return;
  }

  const priceToProductMap = {};
  const productToPriceMap = {};

  console.log(`Processing ${PRODUCT_ADDRESSES.length} products`);
  for (const productAddress of PRODUCT_ADDRESSES) {
    // Fetch capacity
    const capacityURL = `https://api.nexusmutual.io/v1/contracts/${productAddress}/capacity`;
    console.log(`Calling ${capacityURL}`);
    const res = await fetch(capacityURL, {
      headers: {
        'x-api-key': 'c904-42c7-2f90-a561',
        Origin: 'https://app.nexusmutual.io',
      },
    });
    await sleep(100);
    const productState = await res.json();
    console.log(productState);

    // Skip if product is deprecated
    if (productState.reason === 'Uncoverable') {
      console.log(`Product ${productAddress} is Uncoverable. Skipping.`);
      continue;
    }

    // Fetch annual price from the quote API
    const currency = DAI_COVER_BLACKLIST.includes(productAddress.toLowerCase()) ? 'ETH' : 'DAI';
    // eslint-disable-next-line max-len
    const quoteURL = `https://api.nexusmutual.io/v1/quote?coverAmount=1&currency=${currency}&period=365&contractAddress=${productAddress}`;
    const quoteRes = await fetch(quoteURL, {
      headers: {
        'x-api-key': 'c904-42c7-2f90-a561',
        Origin: 'https://app.nexusmutual.io',
      },
    });
    await sleep(100);
    const quote = await quoteRes.json();
    const annualPrice = quote.price * 100; // highest is 100.

    // TODO there are currently 3 products that have price 0.
    // This is because there isn't enough stake on them.
    // Solution: create a new quote api endpoint that provides
    // **unsigned** quotes and ignores capacity limits

    productToPriceMap[productAddress] = annualPrice;
    if (!priceToProductMap[annualPrice]) {
      priceToProductMap[annualPrice] = [];
    }
    priceToProductMap[annualPrice].push(productAddress);
  }

  const snippet = getPrices(priceToProductMap, PRODUCT_ADDRESSES);
  console.log({ snippet });
  const templateHelperRegex = /\/\/ \{V1_PRICES_HELPER_BEGIN\}([\s\S]*?)\/\/ \{V1_PRICES_HELPER_END\}/;
  const psContractFile = fs.readFileSync(PS_CONTRACT_PATH, 'utf8');
  const newPSContract = psContractFile.toString().replace(templateHelperRegex, snippet);
  fs.writeFileSync(PS_CONTRACT_PATH, newPSContract);

  console.log({ priceToProductMap, productToPriceMap });
};

if (require.main === module) {
  // bypass cache when run via cli
  main(false)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
