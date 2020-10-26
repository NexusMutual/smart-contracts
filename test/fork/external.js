const abi = require('ethereumjs-abi');
const { hex } = require('../utils').helpers;

function encode (...args) {
  const signature = args[0];
  const params = args.slice(1);
  const datatypes = signature
    .substring(0, signature.length - 1)
    .split('(')[1]
    .split(',');

  for (let i = 0; i < datatypes.length; i++) {
    if (datatypes[i].includes('byte') && !datatypes[i].includes('[]')) {
      if (!params[i].startsWith('0x')) {
        params[i] = hex(params[i]);
        args[i + 1] = params[i];
      }
    }
  }

  const encoded = abi.simpleEncode.apply(this, args);

  return '0x' + encoded.toString('hex');
}

function encode1 (...args) {
  const encoded = abi.rawEncode.apply(this, args);
  return '0x' + encoded.toString('hex');
}

module.exports = { encode, encode1 };
