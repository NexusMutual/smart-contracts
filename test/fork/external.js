const abi = require('ethereumjs-abi');
const { hex } = require('../utils/helpers');

function encode(...args) {
  var signature = args[0];
  var datatypes = signature
    .substring(0, signature.length - 1)
    .split('(')[1]
    .split(',');
  var params = args.slice(1);
  for (let i = 0; i < datatypes.length; i++) {
    if (datatypes[i].includes('byte') && !datatypes[i].includes('[]')) {
      // console.log(params[i]);

      if (!params[i].startsWith('0x')) {
        params[i] = hex(params[i]);
        args[i + 1] = params[i];
      }
    }
  }
  var encoded = abi.simpleEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

function encode1(...args) {
  var encoded = abi.rawEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

module.exports = {encode, encode1};
