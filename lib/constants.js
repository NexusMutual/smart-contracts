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
  swapOperator: hex('SWP_OP'),
  priceFeedOracle: hex('PRC_FEED'),
};

const MCRUintParamType = {
  mcrFloorIncrementThreshold: hex('DMCT'),
  maxMCRFloorIncrement: hex('DMCI'),
  maxMCRIncrement: hex('MMIC'),
  gearingFactor: hex('GEAR'),
  minUpdateTime: hex('MUTI'),
};

const Role = {
  NonMember: 0,
  AdvisoryBoard: 1,
  Member: 2,
  Owner: 3,
};

const CoverStatus = {
  Active: 0,
  ClaimAccepted: 1,
  ClaimDenied: 2,
  CoverExpired: 3,
  ClaimSubmitted: 4,
  Requested: 5,
};

// gov proposal categories
const ProposalCategory = {
  addCategory: 3,
  editCategory: 4,
  upgradeProxy: 5,
  startEmergencyPause: 6,
  addEmergencyPause: 7, // extend or switch off emergency pause
  updateOwnerParameters: 28,
  upgradeNonProxy: 29,
  newContract: 34,
  upgradeMCRParameters: 36,
  upgradeMaster: 37,
  nxmFunding: 38,
  updatePSParameters: 39,
  addIncident: 40,
  withdrawAsset: 41,
};

const Assets = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

const ContractTypes = {
  Replaceable: 1,
  Proxy: 2,
};

module.exports = {
  Assets,
  CoverStatus,
  StakingUintParamType,
  ProposalCategory,
  PoolUintParamType,
  PoolAddressParamType,
  Role,
  MCRUintParamType,
  ContractTypes,
};
