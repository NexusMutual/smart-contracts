const send = (method, params = []) => new Promise((resolve, reject) => {
  web3.currentProvider.send(
    { jsonrpc: '2.0', id: Date.now(), method, params },
    (err, res) => err ? reject(err) : resolve(res),
  );
});

const takeSnapshot = async () => send('evm_snapshot');
const revertSnapshot = async id => send('evm_revert', [id]);

module.exports = {
  takeSnapshot,
  revertSnapshot,
};
