const { ethers } = require('hardhat');
const Decimal = require('decimal.js');

const { BigNumber } = ethers;

const toDecimal = value => new Decimal(value.toString());

const max = (a, b) => {
  const decimalA = toDecimal(a);
  const decimalB = toDecimal(b);
  return decimalA.gt(decimalB) ? decimalA : decimalB;
};

const COVER_PRICE_SURPLUS_MARGIN = toDecimal('1.3');
const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const getContractFactory = provider => async code => {
  const { mainnet } = await fetch(VERSION_DATA_URL).then(res => res.json());
  const { contractAbi, address } = mainnet.abis.find(c => c.code === code);
  const abi = JSON.parse(contractAbi);
  return ethers.getContractAt(abi, address, provider);
};

const QuoteEngine = async provider => {
  const contractFactory = getContractFactory(provider);
  const pooledStaking = await contractFactory('PS');

  /**
   * Fetches total unprocessed unstakes for a contract
   *
   * @param {string} contractAddress
   * @return {BigNumber} Net Staked NXM amount as decimal.js instance
   */
  const getTotalUnprocessedUnstake = async contractAddress => {
    const headPointer = await pooledStaking.unstakeRequests(0);
    const firstUnprocessedUnstake = await pooledStaking.unstakeRequests(headPointer.next);
    const unstakeRequestEvents = await getUnstakeRequests(contractAddress);

    const totalUnprocessedUnstakeBN = unstakeRequestEvents
      .map(event => event.args)
      .filter(e => e.unstakeAt.toNumber() >= firstUnprocessedUnstake.unstakeAt.toNumber())
      .map(e => e.amount)
      .reduce((a, b) => a.add(b), BigNumber.from('0'));

    return totalUnprocessedUnstakeBN;
  };

  /**
   * Fetches total pending unstaked NXM on a smart contract at timestamp 'now'
   *
   * @param {string} contractAddress
   * @return {Decimal} Pending unstaked NXM amount as decimal.js instance
   */
  const getUnstakeRequests = async contractAddress => {
    const BLOCK_TIME = 12;
    const UNSTAKE_PROCESSING_DAYS = 45;
    const blocksBack = Math.floor((UNSTAKE_PROCESSING_DAYS * 24 * 3600) / BLOCK_TIME);
    const filter = pooledStaking.filters.UnstakeRequested(contractAddress);
    return await pooledStaking.queryFilter(filter, -blocksBack);
  };

  /**
   * Calculates risk percentage as a value between 1 and 100
   *
   * @param {Decimal} netStakedNxm
   * @return {Decimal} risk percentage
   */
  const calculateRisk = netStakedNxm => {
    const STAKED_HIGH_RISK_COST = toDecimal(100);
    const LOW_RISK_COST_LIMIT_NXM = toDecimal(50000).mul('1e18');
    const PRICING_EXPONENT = toDecimal(7);
    const STAKED_LOW_RISK_COST = toDecimal(2);
    // uncappedRiskCost = stakedHighRiskCost * [1 - netStakedNXM/lowRiskCostLimit ^ (1/pricingExponent) ];
    const exponent = toDecimal(1).div(PRICING_EXPONENT);
    const uncappedRiskCost = STAKED_HIGH_RISK_COST.mul(
      toDecimal(1).sub(toDecimal(netStakedNxm).div(LOW_RISK_COST_LIMIT_NXM).pow(exponent)),
    );
    return max(STAKED_LOW_RISK_COST, uncappedRiskCost);
  };

  /**
   * @param {string} contractAddress
   * @param {string} amount Requested cover amount (might differ from offered cover amount)
   * @param {string} currency
   * @param {number} period
   * @return {object}
   */
  return async contractAddress => {
    contractAddress = contractAddress.toLowerCase();
    const totalUnprocessedUnstake = await getTotalUnprocessedUnstake(contractAddress);
    const contractStake = await pooledStaking.contractStake(contractAddress);
    const netStakedNxm = contractStake.sub(totalUnprocessedUnstake.div(2));

    const fixedAnnualPrice =
      (contractAddress === '0x0000000000000000000000000000000000000025' && 210) || // Stakewise operated
      (contractAddress === '0x0000000000000000000000000000000000000026' && 230) || // Stakewise 3rd party
      (contractAddress === '0x0000000000000000000000000000000000000029' && 200) || // Sherlock
      (contractAddress === '0x0000000000000000000000000000000000000033' && 225) || // Liquid Collective
      (contractAddress === '0xc57d000000000000000000000000000000000011' && 10000) || // FTX
      0;

    const quotePriceInWei = fixedAnnualPrice
      ? toDecimal(fixedAnnualPrice).div(10000)
      : calculateRisk(netStakedNxm).div(100).mul(COVER_PRICE_SURPLUS_MARGIN);

    const quotePrice = quotePriceInWei.mul('1e18').floor();

    return quotePrice.toString();
  };
};

if (require.main === module) {
  QuoteEngine(ethers.provider)
    .then(quoteEngine => quoteEngine('0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce', '1', 'ETH'))
    // .then(quoteEngine => quoteEngine('0x0000000000000000000000000000000000000025', '1', 'ETH'))
    .then(quote => console.log({ quote }))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    })
    .then(() => process.exit());
}

module.exports = QuoteEngine;
