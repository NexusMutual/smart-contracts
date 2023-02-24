require('dotenv').config();
const fs = require('fs');
const fetch = require('node-fetch');
const path = require('path');

const PRODUCT_ADDRESSES = require(path.join(__dirname, 'output/product-addresses.json'));
const PRICES_CONTRACT_PATH = path.join(__dirname, '../../contracts/modules/legacy/PricesV1.sol');

const generatePricesCode = (priceMap, productIds) => {
  const prices = Object.keys(priceMap);
  const indent = '    ';

  const priceToBps = price => Math.ceil(price / 1e14);
  const priceToPercent = price => (price / 1e16).toFixed(6);

  const codeBlocks = prices.map(price => {
    // single item
    if (priceMap[price].length === 1) {
      const [productAddress] = priceMap[price];
      const productId = productIds.indexOf(productAddress);
      const lines = [
        `if (id == ${productId}) { // ${productAddress}`,
        `  return ${priceToBps(price)}; // ${priceToPercent(price)} %`,
        `}`,
      ];
      return lines.map(line => indent + line).join('\n');
    }

    // multi
    const productAddresses = priceMap[price];
    const lastIdx = productAddresses.length - 1;

    const items = productAddresses.map((productAddress, idx) => {
      const productId = productIds.indexOf(productAddress);
      const operator = idx === lastIdx ? '   ' : ' ||';
      return `  id == ${productId}${operator} // ${productAddress}`;
    });

    const lines = [
      'if (',
      ...items, // checks for each product
      ') {',
      `  return ${priceToBps(price)}; // ${priceToPercent(price)} %`,
      '}',
    ];

    return lines.map(line => indent + line).join('\n');
  });

  return (
    [
      indent + '// V1_PRICES_HELPER_BEGIN',
      ...codeBlocks, // price blocks
      indent + '// V1_PRICES_HELPER_END',
    ].join('\n\n') + '\n'
  );
};

const main = async (useCache = true) => {
  // check the cache first
  if (useCache) {
    console.log('Using cached data for get V1 cover prices');
    return;
  }

  console.log(`Processing ${PRODUCT_ADDRESSES.length} products`);
  const priceToProductMap = {};

  // These products are not allowed to be covered in DAI
  const DAI_COVER_BLACKLIST = [
    '0x35d1b3f3d7966a1dfe207aa4514c12a259a0492b', // Maker DAO
    '0x0000000000000000000000000000000000000010', // Curve sETH LP (eCrv)
    '0x0000000000000000000000000000000000000013', // Convex stethCrv (cvxstethCrv)
  ];

  for (const productAddress of PRODUCT_ADDRESSES) {
    console.log(`Fetching price for ${productAddress}`);

    // Fetch annual price from the quote API
    const currency = DAI_COVER_BLACKLIST.includes(productAddress.toLowerCase()) ? 'ETH' : 'DAI';

    // eslint-disable-next-line max-len
    const quoteURL = `https://api.nexusmutual.io/v1/quote?coverAmount=1&currency=${currency}&period=365&contractAddress=${productAddress}`;
    const quoteRes = await fetch(quoteURL, { headers: { Origin: 'https://app.nexusmutual.io' } });
    const { price = false } = await quoteRes.json();

    if (price === false) {
      // price missing, quote engine didn't return a price
      continue;
    }

    // TODO there are currently 3 products that have price 0.
    // This is because there isn't enough stake on them.
    // Solution: create a new quote api endpoint that provides
    // **unsigned** quotes and ignores capacity limits

    if (!priceToProductMap[price]) {
      priceToProductMap[price] = [];
    }

    priceToProductMap[price].push(productAddress);
  }

  const snippet = generatePricesCode(priceToProductMap, PRODUCT_ADDRESSES);
  console.log('Generated solidity:\n', snippet);

  const templateHelperRegex = / {4}\/\/ V1_PRICES_HELPER_BEGIN.+V1_PRICES_HELPER_END\n/s;
  const pricesContractFile = fs.readFileSync(PRICES_CONTRACT_PATH, 'utf8').toString();
  const newPricesContract = pricesContractFile.replace(templateHelperRegex, snippet);
  fs.writeFileSync(PRICES_CONTRACT_PATH, newPricesContract);
  console.log('contract matches:', !!pricesContractFile.match(templateHelperRegex));
  console.log('new contract:\n', newPricesContract);

  console.log({ priceToProductMap });
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
