const { ethers } = require('hardhat');

// this hex function produces evm-compatible hex strings:
// - strips leading zeroes (0x01 -> 0x1)
// - keeps one zero if the value is zero (0x00 -> 0x0)
const hex = n => ethers.toBeHex(n);

const setNextBlockTime = async time => ethers.provider.send('evm_setNextBlockTimestamp', [time]);
const mineNextBlock = async () => ethers.provider.send('evm_mine', []);
const increaseTime = async time => ethers.provider.send('evm_increaseTime', [time]);

const impersonateAccount = async address => ethers.provider.send('hardhat_impersonateAccount', [address]);
const stopImpersonatingAccount = async address => ethers.provider.send('hardhat_stopImpersonatingAccount', [address]);

const takeSnapshot = async () => ethers.provider.send('evm_snapshot', []);
const revertToSnapshot = async id => ethers.provider.send('evm_revert', [id]);
const reset = async () => ethers.provider.send('hardhat_reset', []);

const setEtherBalance = async (address, wei) => ethers.provider.send('hardhat_setBalance', [address, hex(wei)]);
const setNextBlockBaseFee = async fee => ethers.provider.send('hardhat_setNextBlockBaseFeePerGas', [hex(fee)]);
const setAutomine = state => ethers.provider.send('evm_setAutomine', [state]);
const setCode = async (address, code) => ethers.provider.send('hardhat_setCode', [address, code]);
const setNonce = async (address, nonce) => ethers.provider.send('hardhat_setNonce', [address, hex(nonce)]);

module.exports = {
  setNextBlockTime,
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
  reset,
};
