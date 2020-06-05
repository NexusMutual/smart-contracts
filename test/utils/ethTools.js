const Web3 = require('web3');
const web3 = new Web3(); // Hardcoded development port
function ether(n) {
  return new web3.BigNumber(web3.toWei(n, 'ether'));
}

function toWei(value) {
  return web3.toWei(value, 'ether');
}

function toHex(value) {
  return web3.toHex(value);
}
module.exports = {
  ether,
  toWei,
  toHex
};
