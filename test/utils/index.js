const { web3 } = require('@openzeppelin/test-environment');
const { constants, helpers } = require('../../lib');
const accounts = require('./accounts');

const tenderly = async tx => helpers.tenderly(web3, tx);

module.exports = { accounts, constants, helpers: { ...helpers, tenderly } };
