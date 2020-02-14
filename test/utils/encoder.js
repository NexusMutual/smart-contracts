var abi = require('ethereumjs-abi');
const {toHex} = require('./ethTools');
function encode(...args) {
  var signature = args[0];
  var datatypes = signature
    .substring(0, signature.length - 1)
    .split('(')[1]
    .split(',');
  var params = args.slice(1);
  for (let i = 0; i < datatypes.length; i++) {
    if (datatypes[i].includes('byte')) {
      if (!params[i].startsWith('0x')) {
        params[i] = toHex(params[i]);
        args[i + 1] = params[i];
      }
    }
  }
  var encoded = abi.simpleEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

module.exports = {encode};
