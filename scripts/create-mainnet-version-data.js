const fs = require('fs');
const path = require('path');

const artifactByCode = {
  CD: 'contracts/modules/claims/ClaimsData.sol/ClaimsData.json',
  CL: 'contracts/modules/claims/Claims.sol/Claims.json',
  CP: 'contracts/modules/claims/ClaimProofs.sol/ClaimProofs.json',
  CR: 'contracts/modules/claims/ClaimsReward.sol/ClaimsReward.json',
  GV: 'contracts/modules/governance/Governance.sol/Governance.json',
  GW: 'contracts/modules/cover/Gateway.sol/Gateway.json',
  IC: 'contracts/modules/claims/Incidents.sol/Incidents.json',
  MC: 'contracts/modules/capital/MCR.sol/MCR.json',
  MR: 'contracts/modules/governance/MemberRoles.sol/MemberRoles.json',
  NXMASTER: 'contracts/modules/governance/NXMaster.sol/NXMaster.json',
  NXMTOKEN: 'contracts/modules/token/NXMToken.sol/NXMToken.json',
  P1: 'contracts/modules/capital/Pool.sol/Pool.json',
  P2: 'contracts/modules/capital/Pool2.sol/Pool2.json',
  PC: 'contracts/modules/governance/ProposalCategory.sol/ProposalCategory.json',
  PS: 'contracts/modules/staking/PooledStaking.sol/PooledStaking.json',
  QD: 'contracts/modules/cover/QuotationData.sol/QuotationData.json',
  QT: 'contracts/modules/cover/Quotation.sol/Quotation.json',
  SO: 'contracts/modules/capital/SwapOperator.sol/SwapOperator.json',
  TC: 'contracts/modules/token/TokenController.sol/TokenController.json',
  TD: 'contracts/modules/token/TokenData.sol/TokenData.json',
  TF: 'contracts/modules/token/TokenFunctions.sol/TokenFunctions.json',
  PRICEORACLE: 'contracts/modules/oracles/PriceFeedOracle.sol/PriceFeedOracle.json',
  TWAP: 'contracts/modules/oracles/TwapOracle.sol/TwapOracle.json',
  DF: 'contracts/modules/distributor/DistributorFactory.sol/DistributorFactory.json',
  CSI: '../deploy/external/CommunityStakingIncentives.json',
  // external
  DAI: '@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json',
  stETH: '@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json',
  'CHAINLINK-DAI-ETH': 'contracts/modules/oracles/PriceFeedOracle.sol/Aggregator.json',
};

const contractCodeByName = {
  ClaimsData: 'CD',
  Claims: 'CL',
  ClaimsReward: 'CR',
  Governance: 'GV',
  MCR: 'MC',
  MemberRoles: 'MR',
  NXMaster: 'NXMASTER',
  NXMToken: 'NXMTOKEN',
  Pool: 'P1',
  Pool2: 'P2',
  ProposalCategory: 'PC',
  QuotationData: 'QD',
  Quotation: 'QT',
  TokenController: 'TC',
  TokenData: 'TD',
  TokenFunctions: 'TF',
  PooledStaking: 'PS',
  ClaimProofs: 'CP',
  Gateway: 'GW',
  Incidents: 'IC',
  SwapOperator: 'SO',
  PriceFeedOracle: 'PRICEORACLE',
  TwapOracle: 'TWAP',
  CommunityStakingIncentives: 'CSI',
  DistributorFactory: 'DF',
  // external
  Aggregator: 'CHAINLINK-DAI-ETH',
  Dai: 'DAI',
};

const rootPath = path.normalize(`${__dirname}/../`);
const addresses = require(`${rootPath}/deploy/mainnet-input.json`);

const getContractAbi = code => {
  const artifactPath = `${rootPath}/artifacts/${artifactByCode[code]}`;
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return JSON.stringify(artifact.abi);
};

const versionData = Object.keys(addresses).map(name => ({
  code: contractCodeByName[name],
  address: addresses[name],
  contractName: name,
  contractAbi: getContractAbi(contractCodeByName[name]),
}));

const outfile = `${rootPath}/deploy/mainnet-data.json`;

fs.writeFileSync(
  outfile,
  JSON.stringify({ mainnet: { abis: versionData } }, null, 2),
);

console.log(`${path.basename(outfile)} generated succesfully`);
