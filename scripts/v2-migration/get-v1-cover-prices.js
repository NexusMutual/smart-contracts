const { ethers } = require('hardhat');
const { assert } = require('chai');
const fs = require('fs');
const path = require('path');

const QuoteEngine = require('./v1-quote-engine');

const PRODUCT_ADDRESSES = require(path.join(__dirname, 'output/product-addresses.json'));
const PRICES_CONTRACT_PATH = path.join(__dirname, '../../contracts/modules/legacy/PricesV1.sol');

const generatePricesCode = (priceMap, productIds) => {
  const prices = Object.keys(priceMap);
  const indent = '    ';

  const priceToBps = price => Math.ceil(Number(price) / 1e14);
  const priceToPercent = price => (Number(price) / 1e16).toFixed(6);

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

const main = async (provider, useCache = true) => {
  // check the cache first
  if (useCache) {
    console.log('Using cached data for get V1 cover prices');
    return;
  }

  const quoteEngine = await QuoteEngine(provider);

  console.log(`Processing ${PRODUCT_ADDRESSES.length} products`);
  const priceToProductMap = {};

  for (const productAddress of PRODUCT_ADDRESSES) {
    console.log(`Fetching price for ${productAddress}`);
    const price = await quoteEngine(productAddress);

    assert(price !== '0');

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
  assert(!!pricesContractFile.match(templateHelperRegex), 'Template regex did not match anything');

  console.log({ priceToProductMap });
};

if (require.main === module) {
  // bypass cache when run via cli
  main(ethers.provider, false)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
