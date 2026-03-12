const { ethers } = require('hardhat');

/**
 * NOTE: should only contain RPC methods that are not covered by hardhat-network-helpers package
 */

const setAutomine = state => ethers.provider.send('evm_setAutomine', [state]);

module.exports = {
  setAutomine,
};
