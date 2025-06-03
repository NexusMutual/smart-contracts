const { ethers } = require('hardhat');

function divCeil(a, b) {
  a = BigInt(a);
  b = BigInt(b);
  return (a + b - 1n) / b;
}

function min(a, b) {
  a = BigInt(a);
  b = BigInt(b);
  return a < b ? a : b;
}

function max(a, b) {
  a = BigInt(a);
  b = BigInt(b);
  return a > b ? a : b;
}

module.exports = {
  divCeil,
  min,
  max,
};
