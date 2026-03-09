const { nexus } = require('hardhat');

const evm = require('../utils/evm');

const helpers = {
  daysToSeconds: days => days * 24 * 60 * 60,
};

const bnMath = {
  divCeil: (a, b) => {
    const x = BigInt(a);
    const y = BigInt(b);
    return (x + y - 1n) / y;
  },
  max: (a, b) => (BigInt(a) >= BigInt(b) ? BigInt(a) : BigInt(b)),
  min: (a, b) => (BigInt(a) <= BigInt(b) ? BigInt(a) : BigInt(b)),
};

const errors = {
  DIVIDE_BY_ZERO: 0x12,
};

module.exports = {
  constants: nexus.constants,
  evm,
  helpers,
  bnMath,
  errors,
};
