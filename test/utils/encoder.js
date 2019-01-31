var abi = require('ethereumjs-abi');

function encode(...args) {
  var encoded = abi.simpleEncode.apply(this, args);
  encoded = encoded.toString('hex');
  return '0x' + encoded;
}

module.exports = { encode };
