const { network: { provider } } = require('hardhat');

const setNextBlockTime = async time => provider.send(
  'evm_setNextBlockTimestamp',
  [time],
);

const mineNextBlock = async () => provider.send('evm_mine');

const impersonateAccount = async address => provider.send(
  'hardhat_impersonateAccount',
  [address],
);

const stopImpersonatingAccount = async address => provider.send(
  'hardhat_stopImpersonatingAccount',
  [address],
);

module.exports = {
  setNextBlockTime,
  mineNextBlock,
  impersonateAccount,
  stopImpersonatingAccount,
};
