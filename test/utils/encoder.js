var abi = require('ethereumjs-abi');
const Web3 = require('web3');
const web3 = new Web3();
function encode(...args) {
  if (args.length == 1) {
    return '0x';
  }
  let fn = args[0];
  let params = args.slice(1);
  let types = fn
    .slice(0, fn.length - 1)
    .split('(')[1]
    .split(',');
  for (let i = 0; i < types.length; i++) {
    if (types[i].includes('bytes') && !params[i].startsWith('0x')) {
      params[i] = web3.toHex(params[i]);
    }
  }
  args = [types, params];
  let encoded = abi.rawEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

function encode1(...args) {
  var encoded = abi.rawEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

module.exports = {encode, encode1};
