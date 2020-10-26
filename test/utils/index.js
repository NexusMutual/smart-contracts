const { web3 } = require('hardhat');
const { constants, helpers } = require('../../lib');
const accounts = require('./accounts');
const snapshot = require('./snapshot');

/**
 * Export tx to tenderly. Accepts a tx hash string or a promise that resolves to a receipt.
 * Returns the receipt if a promise was passed.
 * @param {string|Promise} txPromise
 * @return {Promise<undefined|{}>}
 */
const tenderly = async txPromise => helpers.tenderlyFactory(web3)(txPromise);

module.exports = {
  accounts,
  constants,
  helpers: { ...helpers, tenderly },
  snapshot,
};
