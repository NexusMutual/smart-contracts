const accounts = require('../../utils/accounts');
const evm = require('../../utils/evm');
const calculateStakingPoolAddress = require('../../utils/calculateStakingPoolAddress');
const pool = require('../../utils/pool');
const stakingPool = require('../../utils/stakingPool');

module.exports = {
  ...accounts,
  ...evm,
  ...calculateStakingPoolAddress,
  ...pool,
  ...stakingPool,
};
