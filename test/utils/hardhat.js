const { network: { provider } } = require('hardhat');

const setTime = async time => {
  await provider.send('evm_setNextBlockTimestamp', [time]);
  await provider.send('evm_mine', []);
};

const impersonateAccount = async address =>
  provider.send(
    'hardhat_impersonateAccount',
    [address],
  );

const stopImpersonatingAccount = async address =>
  provider.send(
    'hardhat_stopImpersonatingAccount',
    [address],
  );

module.exports = {
  setTime,
  impersonateAccount,
  stopImpersonatingAccount,
};
