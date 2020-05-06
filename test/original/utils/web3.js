// const { web3 } = require('@openzeppelin/test-environment');
// const pify = require('pify');

const ethAsync = {};// pify(web3.eth);

module.exports = {
  ethGetBalance: ethAsync.getBalance,
  ethSendTransaction: ethAsync.sendTransaction,
  ethGetBlock: ethAsync.getBlock,
};
