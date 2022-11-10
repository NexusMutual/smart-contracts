const { BigNumber, utils } = require('ethers');
const { provider } = require('hardhat').network;

// evm doesn't like hex strings with leading zeros
const toEvmHex = n => {
  const hex = BigNumber.from(n).toHexString();
  const stripped = utils.hexStripZeros(hex);
  return stripped === '0x' ? '0x0' : stripped;
};

const setNextBlockTime = async time => provider.send('evm_setNextBlockTimestamp', [time]);
const mineNextBlock = async () => provider.send('evm_mine');
const increaseTime = async time => provider.send('evm_increaseTime', [time]);

const impersonateAccount = async address => provider.send('hardhat_impersonateAccount', [address]);
const stopImpersonatingAccount = async address => provider.send('hardhat_stopImpersonatingAccount', [address]);

const takeSnapshot = async () => provider.send('evm_snapshot');
const revertToSnapshot = async id => provider.send('evm_revert', [id]);

const setEtherBalance = async (address, wei) => provider.send('hardhat_setBalance', [address, toEvmHex(wei)]);
const setNextBlockBaseFee = async fee => provider.send('hardhat_setNextBlockBaseFeePerGas', [toEvmHex(fee)]);

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
};
