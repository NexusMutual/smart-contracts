require('dotenv').config();
const fs = require('fs');
const ethers = require('ethers');
const fetch = require('node-fetch');
const Decimal = require('decimal.js');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const max = (a, b) => (a.gt(b) ? a : b);

const SURPLUS = 0.3; // 30%

const calculateRisk = netStakedNxm => {
  const STAKED_HIGH_RISK_COST = Decimal(100);
  const LOW_RISK_COST_LIMIT_NXM = Decimal(50000).mul('1e18');
  const PRICING_EXPONENT = Decimal(7);
  const STAKED_LOW_RISK_COST = Decimal(2);
  // uncappedRiskCost = stakedHighRiskCost * [1 - netStakedNXM/lowRiskCostLimit ^ (1/pricingExponent) ];
  const exponent = Decimal(1).div(PRICING_EXPONENT);
  const uncappedRiskCost = STAKED_HIGH_RISK_COST.mul(
    Decimal(1).sub(netStakedNxm.div(LOW_RISK_COST_LIMIT_NXM).pow(exponent)),
  );

  return max(STAKED_LOW_RISK_COST, uncappedRiskCost);
};

const getYearlyCost = netStaked => {
  return (
    calculateRisk(
      // If netStaked starts with - it's a quote-api calcualtion error.
      // Prevent crashes by assuming that netStaked is 0 in this case.
      netStaked.startsWith('-') ? Decimal('0') : Decimal(netStaked),
    ).toNumber() *
    (1 + SURPLUS)
  );
};
const idToProductName = (id, migratableProducts) => migratableProducts[id].name;

const getPrices = (priceMap, v1ProductIds, migratableProducts) => `// {V1_PRICES_HELPER_BEGIN}
${Object.keys(priceMap)
  .map(price => {
    if (priceMap[price].length > 1) {
      return `
    if (
${priceMap[price]
  .map((address, index) => {
    const lineEnd = index < priceMap[price].length - 1 ? ' ||\n' : '';
    const productId = v1ProductIds.findIndex(x => x === address);
    return `      // ${idToProductName(productId, migratableProducts)}
      id == ${productId}${lineEnd}`;
  })
  .join('')}
    ) {
      return ${price}; // ${price / 1e18}%
    }`;
    }
    const productId = v1ProductIds.findIndex(x => x === priceMap[price][0]);
    return `
    // ${idToProductName(productId, migratableProducts)}
    if (id == ${productId}) {
      return ${price}; // ${price / 1e18}%
    }`;
  })
  .join('\n')}
    // {V1_PRICES_HELPER_END}`;

const main = async () => {
  const products = JSON.parse(fs.readFileSync('./scripts/v2-migration/input/contracts.json'));
  const migratableProducts = JSON.parse(fs.readFileSync('./deploy/migratableProducts.json'));

  const priceToProductMap = {};
  const productToPriceMap = {};
  for (const product in products) {
    if (products[product].deprecated) {
      continue;
    }

    const res = await fetch(`https://api.nexusmutual.io/v1/contracts/${product}/capacity`, {
      headers: {
        'x-api-key': 'c904-42c7-2f90-a561',
        Origin: 'https://app.nexusmutual.io',
      },
    });
    await sleep(1000);
    const productState = await res.json();
    console.log(productState);
    const annualPrice = ethers.utils.parseUnits(getYearlyCost(productState.netStakedNXM).toString()).toString();

    productToPriceMap[product] = annualPrice;
    if (!priceToProductMap[annualPrice]) {
      priceToProductMap[annualPrice] = [];
    }
    priceToProductMap[annualPrice].push(product);

    const v1ProductIds = JSON.parse(fs.readFileSync('./deploy/v1ProductIds.json'));
    console.log({ migratableProducts });
    const snippet = getPrices(priceToProductMap, v1ProductIds, migratableProducts);
    console.log({ snippet });
    const contract = fs.readFileSync('./contracts/modules/staking/PooledStaking.sol');
    const templateHelperRegex = /\/\/ \{V1_PRICES_HELPER_BEGIN\}([\s\S]*?)\/\/ \{V1_PRICES_HELPER_END\}/;
    const newContract = contract.toString().replace(templateHelperRegex, snippet);
    fs.writeFileSync('./contracts/modules/staking/PooledStaking.sol', newContract);
  }

  console.log({ priceToProductMap, productToPriceMap });
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = { main };
