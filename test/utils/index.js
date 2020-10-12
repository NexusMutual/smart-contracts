const { web3 } = require('@openzeppelin/test-environment');
const { constants, helpers } = require('../../lib');
const accounts = require('./accounts');
const snapshot = require('./snapshot');
const expectThrowsAsync = require('./expectThrowsAsync');

const tenderly = async tx => helpers.tenderlyFactory(web3)(tx);

module.exports = {
  accounts,
  constants,
  helpers: { ...helpers, tenderly },
  snapshot,
  expectThrowsAsync,
};
