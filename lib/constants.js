const { hex } = require('./helpers');

const StakingUintParamType = {
  MIN_STAKE: hex('MIN_STAK'),
  MAX_EXPOSURE: hex('MAX_EXPO'),
  MIN_UNSTAKE: hex('MIN_UNST'),
  UNSTAKE_LOCK_TIME: hex('UNST_LKT'),
};

const PoolUintParamType = {
  minPoolEth: hex('MIN_ETH'),
};

const PoolAddressParamType = {
  twapOracle: hex('TWAP'),
  swapController: hex('SWAP'),
  priceFeedOracle: hex('PRC_FEED'),
};

const Role = {
  NonMember: 0,
  AdvisoryBoard: 1,
  Member: 2,
  Owner: 3,
};

// gov proposal categories
const ProposalCategory = {
  addCategory: 3,
  upgradeProxy: 5,
  upgradeNonProxy: 29,
  newContract: 34,
  upgradeMaster: 37,
};

module.exports = {
  StakingUintParamType,
  ProposalCategory,
  PoolUintParamType,
  PoolAddressParamType,
  Role,
};
