const { toBytes8 } = require('./helpers');

const StakingUintParamType = {
  MIN_STAKE: toBytes8('MIN_STAK'),
  MAX_EXPOSURE: toBytes8('MAX_EXPO'),
  MIN_UNSTAKE: toBytes8('MIN_UNST'),
  UNSTAKE_LOCK_TIME: toBytes8('UNST_LKT'),
};

const PoolUintParamType = {
  minPoolEth: toBytes8('MIN_ETH'),
};

const PoolAddressParamType = {
  swapOperator: toBytes8('SWP_OP'),
  priceFeedOracle: toBytes8('PRC_FEED'),
};

const MCRUintParamType = {
  mcrFloorIncrementThreshold: toBytes8('DMCT'),
  maxMCRFloorIncrement: toBytes8('DMCI'),
  maxMCRIncrement: toBytes8('MMIC'),
  gearingFactor: toBytes8('GEAR'),
  minUpdateTime: toBytes8('MUTI'),
};

const NXMasterOwnerParamType = {
  msWallet: toBytes8('MSWALLET'),
  quotationAuthority: toBytes8('QUOAUTH'),
  kycAuthority: toBytes8('KYCAUTH'),
  emergencyAdmin: toBytes8('EMADMIN'),
};

const Role = {
  Unassigned: 0,
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
  addNewMemberRole: 1,
  updateMemberRole: 2,
  addCategory: 3,
  editCategory: 4,
  upgradeProxy: 5,
  startEmergencyPause: 6,
  editEmergencyPause: 7, // extend or switch off emergency pause
  burnClaims: 8,
  pauseClaims: 9, // Pause Claim Assessor Voting for 3 days
  changeCapitalModel: 10,
  changePricingModel: 11,
  withdrawFundsForSupportServices: 12,
  addInvestmentAsset: 13,
  editInvestmentAssetHolding: 14, // min and max holding percentages
  editInvestmentAssetStatus: 15,
  changeABMember: 16,
  addCurrencyAsset: 17,
  changeVotingPeriodTo3Days: 18,
  specialResolution: 19,
  updateTokenParameters: 20,
  updateRiskAssessmentParameters: 21,
  updateGovernanceParameters: 22,
  updateQuotationParameters: 23,
  updateClaimsAssessmentParameters: 24,
  updateInvestmentModuleParameters: 25,
  updateCapitalModelParameters: 26,
  changeMasterAddress: 27,
  updateOwnerParameters: 28,
  upgradeMultipleContracts: 29,
  editCurrencyAssetAddress: 30,
  editCurrencyAssetBaseMin: 31,
  editInvestmentAssetAddressDecimal: 32,
  tradingTriggerCheck: 33,
  newContract: 34,
  editTokenControllerParameters: 35,
  upgradeMCRParameters: 36,
  upgradeMasterAddress: 37,
  nxmFunding: 38,
  updatePSParameters: 39,
  updatePoolAddressParameters: 40,
  setAddressDetails: 41,
  newContracts: 42, // mismatch from the https://app.nexusmutual.io/governance/categories
  removeContracts: 43, // newly added category
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

const InternalContractsIDs = {
  TC: 0, // TokenController.sol
  P1: 1, // Pool.sol
  MR: 2, // MemberRoles.sol
  MC: 3, // MCR.sol
  CO: 4, // Cover.sol
  AS: 5, // Assessment.sol
  TK: 6, // NXMToken.sol
  PS: 7, // LegacyPooledStaking.sol
  GV: 8, // Governance.sol
  IC: 9, // IndividualClaims.sol
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
  InternalContractsIDs,
  NXMasterOwnerParamType,
  PoolAsset,
};
