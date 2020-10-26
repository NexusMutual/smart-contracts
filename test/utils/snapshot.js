const { web3 } = require('hardhat');

const send = (method, params = []) => new Promise((resolve, reject) => {
  web3.currentProvider.send(
    { jsonrpc: '2.0', id: Date.now(), method, params },
    (err, res) => err ? reject(err) : resolve(res),
  );
});

const takeSnapshot = async () => {
  const { result } = await send('evm_snapshot');
  return result;
};

const revertToSnapshot = async id => send('evm_revert', [id]);

module.exports = {
  takeSnapshot,
  revertToSnapshot,
};
