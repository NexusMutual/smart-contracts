const { toBytes8 } = require('./helpers');

const ContractIndexes = {
  C_REGISTRY: 1n << 0n,
  C_GOVERNOR: 1n << 1n,
  C_TOKEN: 1n << 2n,
  C_TOKEN_CONTROLLER: 1n << 3n,
  C_POOL: 1n << 4n,
  C_COVER: 1n << 5n,
  C_COVER_PRODUCTS: 1n << 6n,
  C_STAKING_PRODUCTS: 1n << 7n,
  C_RAMM: 1n << 8n,
  C_SAFE_TRACKER: 1n << 9n,
  C_LIMIT_ORDERS: 1n << 10n,
  C_STAKING_NFT: 1n << 11n,
  C_COVER_NFT: 1n << 12n,
  C_SWAP_OPERATOR: 1n << 13n,
  C_ASSESSMENTS: 1n << 14n,
  C_CLAIMS: 1n << 15n,
  C_STAKING_POOL_FACTORY: 1n << 16n,
};

const PauseTypes = {
  PAUSE_GLOBAL: 1n << 0n,
  PAUSE_RAMM: 1n << 1n,
  PAUSE_SWAPS: 1n << 2n,
  PAUSE_MEMBERSHIP: 1n << 3n,
  PAUSE_ASSESSMENTS: 1n << 4n,
  PAUSE_CLAIMS: 1n << 5n,
  PAUSE_COVER: 1n << 6n,
};

const Choice = {
  Against: 0,
  For: 1,
  Abstain: 2,
};

const ProposalStatus = {
  Proposed: 0,
  Executed: 1,
  Canceled: 2,
};

const ProposalKind = {
  AdvisoryBoard: 0,
  Member: 1,
};

const SwapKind = {
  ExactInput: 0,
  ExactOutput: 1,
};

const PoolUintParamType = {
  minPoolEth: toBytes8('MIN_ETH'),
};

const PoolAddressParamType = {
  swapOperator: toBytes8('SWP_OP'),
  priceFeedOracle: toBytes8('PRC_FEED'),
};

const MCRUintParamType = {
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

// gov proposal categories
const ProposalCategory = {
  uncategorized: 0,
  addNewMemberRole: 1,
  updateMemberRole: 2,
  addCategory: 3,
  editCategory: 4,
  upgradeProxy: 5,
  startEmergencyPause: 6,
  editEmergencyPause: 7, // extend or switch off emergency pause
  burnClaimAssessor: 8,
  pauseClaims: 9, // Pause Claim Assessor Voting for 3 days
  changeCapitalModel: 10,
  changePricingModel: 11,
  withdrawFundsForSupportServices: 12,
  addInvestmentAsset: 13,
  updateInvestmentAssetHolding: 14, // min and max holding percentages
  updateInvestmentAssetStatus: 15,
  changeABMember: 16,
  addCurrencyAsset: 17,
  noAction: 18,
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
  editInvestmentAssetAddressAndDecimal: 32,
  tradingTriggerCheck: 33,
  newContract: 34,
  updateTokenControllerParameters: 35,
  upgradeMCRParameters: 36,
  upgradeMaster: 37,
  nxmFunding: 38,
  updatePSParameters: 39,
  updatePoolAddressParameters: 40,
  setSwapDetails: 41, // update min, max, slippage for an asset
  addAsset: 42,
  newContracts: 43,
  removeContracts: 44,
  setAssetDetails: 45, // update deprecation and abandonment status of a pool asset
};

const Assets = {
  ETH: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

const PoolAsset = {
  ETH: 0,
  DAI: 1, // deprecated
  stETH: 2,
  NXMTY: 3, // NXM Treasury Yield (Enzyme)
  rETH: 4,
  SafeTracker: 5,
  USDC: 6,
  cbBTC: 7,
  NXM: 255, // used as payment asset but technically not added to Pool assets
};

const ContractTypes = {
  Replaceable: 1,
  Proxy: 2,
};

const ContractCode = {
  Assessment: 'AS',
  // ClaimData: 'CD',
  Cover: 'CO',
  // CoverMigrator: 'CL',
  // Gateway: 'GW',
  Governance: 'GV',
  IndividualClaims: 'CI',
  // LegacyClaimsReward: 'CR',
  MCR: 'MC',
  MemberRoles: 'MR',
  NXMaster: 'NXMASTER',
  NXMToken: 'NXMTOKEN',
  Pool: 'P1',
  // PooledStaking: 'PS',
  ProposalCategory: 'PC',
  // PoolData: 'PD',
  // QuotationData: 'QD',
  // Quotation: 'QT',
  Ramm: 'RA',
  StakingProducts: 'SP',
  TokenController: 'TC',
  // TokenData: 'TD',
  // YieldTokenIncidents: 'CG',
  SafeTracker: 'ST',
  CoverProducts: 'CP',
  LimitOrders: 'LO',
};

const InternalContractsIDs = {
  TC: 0, // TokenController.sol
  P1: 1, // Pool.sol
  MR: 2, // MemberRoles.sol
  MC: 3, // MCR.sol
  CO: 4, // Cover.sol
  SP: 5, // StakingProducts.sol
  // PS: 6, // LegacyPooledStaking.sol
  GV: 7, // Governance.sol
  // GW: 8, // LegacyGateway.sol - removed
  // CL: 9, // CoverMigrator.sol - removed
  AS: 10, // Assessment.sol
  CI: 11, // IndividualClaims.sol - Claims for Individuals
  // CG: 12, // YieldTokenIncidents.sol - Claims for Groups - removed
  RA: 13, // Ramm.sol
  ST: 14, // SafeTracker.sol
  CP: 15, // CoverProducts.sol
  LO: 16, // CoverProducts.sol
};

const AggregatorType = {
  ETH: 0,
  USD: 1,
};

const ClaimMethod = {
  IndividualClaims: 0,
  DeprecatedYTC: 1,
};

const AssessmentStatus = {
  Voting: 0,
  Cooldown: 1,
  Finalized: 2,
};

const AssessmentOutcome = {
  Pending: 0,
  Accepted: 1,
  Denied: 2,
  Draw: 3,
};

module.exports = {
  Assets,
  ProposalCategory,
  PoolUintParamType,
  PoolAddressParamType,
  Role,
  MCRUintParamType,
  ContractTypes,
  InternalContractsIDs,
  NXMasterOwnerParamType,
  PoolAsset,
  ContractCode,
  AggregatorType,
  ClaimMethod,
  AssessmentStatus,
  AssessmentOutcome,
  ContractIndexes,
  PauseTypes,
  SwapKind,
  Choice,
  ProposalStatus,
  ProposalKind,
};
