const { hex } = require('./helpers');

const StakingUintParamType = {
  MIN_STAKE: hex('MIN_STAK'.padEnd(8, '\0')),
  MAX_EXPOSURE: hex('MAX_EXPO'.padEnd(8, '\0')),
  MIN_UNSTAKE: hex('MIN_UNST'.padEnd(8, '\0')),
  UNSTAKE_LOCK_TIME: hex('UNST_LKT'.padEnd(8, '\0')),
};

const PoolUintParamType = {
  minPoolEth: hex('MIN_ETH'.padEnd(8, '\0')),
};

const PoolAddressParamType = {
  swapOperator: hex('SWP_OP'.padEnd(8, '\0')),
  priceFeedOracle: hex('PRC_FEED'.padEnd(8, '\0')),
};

const MCRUintParamType = {
  mcrFloorIncrementThreshold: hex('DMCT'.padEnd(8, '\0')),
  maxMCRFloorIncrement: hex('DMCI'.padEnd(8, '\0')),
  maxMCRIncrement: hex('MMIC'.padEnd(8, '\0')),
  gearingFactor: hex('GEAR'.padEnd(8, '\0')),
  minUpdateTime: hex('MUTI'.padEnd(8, '\0')),
};

const NXMasterOwnerParamType = {
  msWallet: hex('MSWALLET'.padEnd(8, '\0')),
  quotationAuthority: hex('QUOAUTH'.padEnd(8, '\0')),
  kycAuthority: hex('KYCAUTH'.padEnd(8, '\0')),
  emergencyAdmin: hex('EMADMIN'.padEnd(8, '\0')),
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
  newContracts: 42,
  removeContracts: 43,
};

const Assets = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

const PoolAsset = {
  ETH: 0,
  DAI: 1,
  stETH: 2,
  unknown: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
};

const ContractTypes = {
  Replaceable: 1,
  Proxy: 2,
};

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
  NXMasterOwnerParamType,
  PoolAsset,
  ZERO_ADDRESS,
};
