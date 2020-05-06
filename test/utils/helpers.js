const util = require('util');
const exec = util.promisify(require('child_process').exec);
const { web3 } = require('@openzeppelin/test-environment');

const hex = string => '0x' + Buffer.from(string).toString('hex');

const parseLogs = tx => {
  return tx.logs.map(log => {
    console.log(log);
    return log;
  });
};

const tenderly = async tx => {
  const provider = web3.currentProvider;
  const providerURL = provider.wrappedProvider.host.replace(/^http:\/\//, '');
  await exec(`tenderly export ${tx} --rpc ${providerURL} --debug`);
};

const to = promise => new Promise(resolve => {
  promise
    .then(r => resolve([r, null]))
    .catch(e => resolve([null, e]));
});

module.exports = { hex, parseLogs, tenderly, to };
