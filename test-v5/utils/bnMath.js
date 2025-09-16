const { ethers } = require('hardhat');

const { BigNumber } = ethers;

function divCeil(a, b) {
  a = BigNumber.from(a);
  let result = a.div(b);
  if (!a.mod(b).isZero()) {
    result = result.add(1);
  }
  return result;
}

function max(a, b) {
  a = BigNumber.from(a);
  return a.gte(b) ? a : b;
}

function min(a, b) {
  a = BigNumber.from(a);
  return a.lte(b) ? a : b;
}

module.exports = {
  divCeil,
  max,
  min,
};
