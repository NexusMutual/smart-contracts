const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;
const { parseEther } = ethers.utils;

const PRICE_DENOMINATOR = 10000;

async function setup() {
  const accounts = await getAccounts();
  const manager = accounts.defaultSender;
  await setEtherBalance(manager.address, parseEther('1000000'));

  const yieldDeposit = await ethers.deployContract('YieldDeposit', [manager.address]);

  const coverPricePercentage = 500;
  const weEth = await ethers.deployContract('ERC20Mock');
  const stEth = await ethers.deployContract('ERC20Mock');
  const chainLinkPriceFeedWeEth = await ethers.deployContract('ChainlinkAggregatorMock');
  const chainLinkPriceFeedStEth = await ethers.deployContract('ChainlinkAggregatorMock');

  await yieldDeposit.connect(manager).listToken(weEth.address, chainLinkPriceFeedWeEth.address, coverPricePercentage);
  await yieldDeposit.connect(manager).listToken(stEth.address, chainLinkPriceFeedStEth.address, coverPricePercentage);

  await weEth.mint(accounts.members[0].address, parseEther('1000000'));
  await stEth.mint(accounts.members[0].address, parseEther('1000000'));

  await chainLinkPriceFeedWeEth.setLatestAnswer(parseEther('1.0374'));
  await chainLinkPriceFeedStEth.setLatestAnswer(parseEther('1.1365'));

  return {
    manager,
    accounts,
    coverPricePercentage,
    priceDenominator: PRICE_DENOMINATOR,
    contracts: {
      weEth,
      stEth,
      yieldDeposit,
      chainLinkPriceFeedStEth,
      chainLinkPriceFeedWeEth,
    },
  };
}

module.exports = { setup };
