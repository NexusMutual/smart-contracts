const { ethers } = require('hardhat');

const { provider } = ethers;
const { hexValue } = ethers.utils;

const setNextBlockTime = async time => provider.send('evm_setNextBlockTimestamp', [time]);
const mineNextBlock = async () => provider.send('evm_mine', []);
const increaseTime = async time => provider.send('evm_increaseTime', [time]);

const impersonateAccount = async address => provider.send('hardhat_impersonateAccount', [address]);
const stopImpersonatingAccount = async address => provider.send('hardhat_stopImpersonatingAccount', [address]);

const takeSnapshot = async () => provider.send('evm_snapshot', []);
const revertToSnapshot = async id => provider.send('evm_revert', [id]);

const setEtherBalance = async (address, wei) => provider.send('hardhat_setBalance', [address, hexValue(wei)]);
const setNextBlockBaseFee = async fee => provider.send('hardhat_setNextBlockBaseFeePerGas', [hexValue(fee)]);
const setCode = async (address, code) => provider.send('hardhat_setCode', [address, code]);
const setNonce = async (address, nonce) => provider.send('hardhat_setNonce', [address, hexValue(nonce)]);

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
  setCode,
  setNonce,
};
