const { constants, helpers } = require('../../lib');
const proposalCategories = require('../../lib/proposal-categories');

const addresses = require('./addresses');
const accounts = require('./accounts');
const evm = require('./evm');
const buyCover = require('./buyCover');
const getQuote = require('./getQuote');
const governance = require('./governance');
const membership = require('./membership');
const results = require('./results');
const errors = require('./errors');
const rammCalculations = require('./rammCalculations');
const bnMath = require('./bnMath');
const stakingPool = require('./stakingPool');

module.exports = {
  addresses,
  accounts,
  constants,
  evm,
  helpers,
  proposalCategories,
  buyCover,
  getQuote,
  governance,
  membership,
  results,
  errors,
  rammCalculations,
  bnMath,
  stakingPool,
};
