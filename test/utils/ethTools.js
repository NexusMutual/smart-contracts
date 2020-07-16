const { isBN, toBN, toWei: web3ToWei, toHex, toChecksumAddress } = require('web3').utils;

const numberToString = n => typeof n === 'number' ? n.toFixed(18) : n;
const toWei = n => web3ToWei(numberToString(n), 'ether');
const ether = n => toBN(toWei(n));

module.exports = {
  ether,
  isBN,
  toBN,
  toWei,
  toHex,
  toChecksumAddress,
};
