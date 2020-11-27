const { BN, toWei } = require('web3').utils;
const exec = require('child_process').execSync;

const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const formatJSON = json => JSON.stringify(json, null, 2);

const filterArgsKeys = args => {
  const params = {};
  for (const key of Object.keys(args)) {
    if (isNaN(key) && key !== '__length__') {
      const value = args[key];
      params[key] = BN.isBN(value) ? value.toString() : value;
    }
  }
  return params;
};

/**
 * Export tx to tenderly. Accepts a tx hash string or a promise that resolves to a receipt.
 * Returns the receipt if a promise was passed.
 * @param web3
 * @return {function((string|Promise)): Promise<(undefined|{})>}
 */
const tenderlyFactory = (web3, network) => async txPromise => {

  let tx = txPromise;
  let receipt;

  if (typeof txPromise !== 'string') {
    const [ok, err] = await to(txPromise);
    receipt = (ok || err);
    tx = receipt.tx;
  }

  const provider = web3.currentProvider;
  const providerURL = provider.wrappedProvider.host.replace(/^http:\/\//, '');
  const cmd = `tenderly export ${tx} --rpc ${providerURL} --debug`;

  console.log(`Executing: ${cmd}`);
  await exec(cmd, { stdio: 'inherit' });

  return receipt;
};

const logEvents = receipt => {
  receipt.logs.forEach(log => {
    const { event, args } = log;
    const params = filterArgsKeys(args);
    console.log(`Event emitted: ${event}(${formatJSON(params)}`);
  });
  return receipt;
};

const to = promise => new Promise(resolve => {
  promise
    .then(r => resolve([r, null]))
    .catch(e => resolve([null, e]));
});

module.exports = {
  filterArgsKeys,
  hex,
  logEvents,
  sleep,
  to,
  tenderlyFactory
};
