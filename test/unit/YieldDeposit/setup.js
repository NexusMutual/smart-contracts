const { ethers } = require('hardhat');

const { setEtherBalance } = require('../utils').evm;
const { getAccounts } = require('../utils').accounts;
const { parseEther } = ethers.utils;

async function setup() {
  const accounts = await getAccounts();
  const manager = accounts.defaultSender;
  await setEtherBalance(manager.address, parseEther('1000000'));

  const weEth = await ethers.deployContract('ERC20Mock');
  const chainLinkPriceFeed = await ethers.deployContract('ChainlinkAggregatorMock');
  const yieldDeposit = await ethers.deployContract('YieldDeposit', [
    manager.address,
    weEth.address,
    18,
    chainLinkPriceFeed.address,
    500, // 5%
  ]);

  await weEth.mint(accounts.members[0].address, parseEther('1000000'));
  await chainLinkPriceFeed.setLatestAnswer(parseEther('1.0374')); // TODO: '1.0374'?

  return {
    manager,
    accounts,
    contracts: {
      weEth,
      yieldDeposit,
      chainLinkPriceFeed,
    },
  };
}

module.exports = { setup };
