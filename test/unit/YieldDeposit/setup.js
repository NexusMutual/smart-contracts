const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;
const { parseEther } = ethers.utils;

const PRICE_DENOMINATOR = 10000;
const RATE_DENOMINATOR = ethers.BigNumber.from('10').pow(18);

async function setup() {
  const accounts = await getAccounts();
  const manager = accounts.defaultSender;
  await setEtherBalance(manager.address, parseEther('1000000'));

  const yieldDeposit = await ethers.deployContract('YieldDeposit', [manager.address]);

  const coverPricePercentage = 500;
  const weEth = await ethers.deployContract('ERC20Mock');
  const wstEth = await ethers.deployContract('ERC20Mock');
  const chainLinkPriceFeedWeEth = await ethers.deployContract('ChainlinkAggregatorMock');
  const chainLinkPriceFeedWstEth = await ethers.deployContract('ChainlinkAggregatorMock');

  const depositLimitAmount = parseEther('10000');
  await yieldDeposit
    .connect(manager)
    .listToken(weEth.address, chainLinkPriceFeedWeEth.address, depositLimitAmount, coverPricePercentage);
  await yieldDeposit
    .connect(manager)
    .listToken(wstEth.address, chainLinkPriceFeedWstEth.address, depositLimitAmount, coverPricePercentage);

  await weEth.mint(accounts.members[0].address, parseEther('1000000'));
  await wstEth.mint(accounts.members[0].address, parseEther('1000000'));

  await chainLinkPriceFeedWeEth.setLatestAnswer(parseEther('1.0374'));
  await chainLinkPriceFeedWstEth.setLatestAnswer(parseEther('1.1365'));

  return {
    manager,
    accounts,
    coverPricePercentage, // TODO: remove if unused
    priceDenominator: PRICE_DENOMINATOR, // tODO: remove if unused
    rateDenominator: RATE_DENOMINATOR,
    depositLimit: {
      weEth: depositLimitAmount,
      wstEth: depositLimitAmount,
    },
    contracts: {
      weEth,
      wstEth,
      yieldDeposit,
      chainLinkPriceFeedWstEth,
      chainLinkPriceFeedWeEth,
    },
  };
}

module.exports = { setup };
