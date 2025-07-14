const { ethers } = require('hardhat');

const { provider } = ethers;

// this hex function produces evm-compatible hex strings:
// - strips leading zeroes (0x01 -> 0x1)
// - keeps one zero if the value is zero (0x00 -> 0x0)
const hex = n => ethers.toBeHex(n);

const setNextBlockTime = async time => provider.send('evm_setNextBlockTimestamp', [time]);
const setTime = async timestamp => provider.send('evm_setNextBlockTimestamp', [timestamp]);
const mineNextBlock = async () => provider.send('evm_mine', []);
const increaseTime = async time => provider.send('evm_increaseTime', [time]);

const impersonateAccount = async address => provider.send('hardhat_impersonateAccount', [address]);
const stopImpersonatingAccount = async address => provider.send('hardhat_stopImpersonatingAccount', [address]);

const takeSnapshot = async () => provider.send('evm_snapshot', []);
const revertToSnapshot = async id => provider.send('evm_revert', [id]);
const reset = async () => provider.send('hardhat_reset', []);

const setEtherBalance = async (address, wei) => provider.send('hardhat_setBalance', [address, hex(wei)]);
const setNextBlockBaseFee = async fee => provider.send('hardhat_setNextBlockBaseFeePerGas', [hex(fee)]);
const setAutomine = state => provider.send('evm_setAutomine', [state]);
const setCode = async (address, code) => provider.send('hardhat_setCode', [address, code]);
const setNonce = async (address, nonce) => provider.send('hardhat_setNonce', [address, hex(nonce)]);

const getStorageAt = async (address, storageSlot) => provider.send('eth_getStorageAt', [address, hex(storageSlot)]);
const setStorageAt = async (address, storageSlot, value) =>
  provider.send('hardhat_setStorageAt', [address, hex(storageSlot), hex(value)]);

module.exports = {
  setNextBlockTime,
  setTime,
  mineNextBlock,
  increaseTime,
  impersonateAccount,
  stopImpersonatingAccount,
  takeSnapshot,
  revertToSnapshot,
  setEtherBalance,
  setNextBlockBaseFee,
  setAutomine,
  setCode,
  setNonce,
  getStorageAt,
  setStorageAt,
  reset,
};
