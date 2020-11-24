const { network: { provider } } = require('hardhat');

const setNextBlockTime = async time => provider.send('evm_setNextBlockTimestamp', [time]);
const mineNextBlock = async () => provider.send('evm_mine');

const impersonateAccount = async address => provider.send('hardhat_impersonateAccount', [address]);
const stopImpersonatingAccount = async address => provider.send('hardhat_stopImpersonatingAccount', [address]);

const takeSnapshot = async () => provider.send('evm_snapshot');
const revertToSnapshot = async id => provider.send('evm_revert', [id]);
const reset = async () => provider.send('hardhat_reset');

module.exports = {
  setNextBlockTime,
  mineNextBlock,
  impersonateAccount,
  stopImpersonatingAccount,
  takeSnapshot,
  revertToSnapshot,
  reset,
};
