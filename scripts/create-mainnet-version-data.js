const fs = require('fs');
const path = require('path');
const ethers = require('ethers');

const artifactByCode = {
  CD: 'contracts/modules/claims/ClaimsData.sol/ClaimsData.json',
  CL: 'contracts/modules/claims/Claims.sol/Claims.json',
  CP: 'contracts/modules/claims/ClaimProofs.sol/ClaimProofs.json',
  CR: 'contracts/modules/claims/ClaimsReward.sol/ClaimsReward.json',
  GV: 'contracts/modules/governance/Governance.sol/Governance.json',
  GW: 'contracts/modules/cover/Gateway.sol/Gateway.json',
  IC: 'contracts/modules/claims/IndividualClaims.sol/IndividualClaims.json',
  YT: 'contracts/modules/claims/YieldTokenIncidents.sol/YieldTokenIncidents.json',
  AS: 'contracts/modules/claims/Assessment.sol/Assessment.json',
  CO: 'contracts/modules/claims/Cover.sol/Cover.json',
  MC: 'contracts/modules/capital/MCR.sol/MCR.json',
  MR: 'contracts/modules/governance/MemberRoles.sol/MemberRoles.json',
  NXMASTER: 'contracts/modules/governance/NXMaster.sol/NXMaster.json',
  NXMTOKEN: 'contracts/modules/token/NXMToken.sol/NXMToken.json',
  P1: 'contracts/modules/capital/Pool.sol/Pool.json',
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
  CSI: '../scripts/external/CommunityStakingIncentives.json',
  // external
  DAI: '@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json',
  stETH: '@openzeppelin/contracts/token/ERC20/ERC20.sol/ERC20.json',
  'CHAINLINK-DAI-ETH': 'contracts/modules/oracles/PriceFeedOracle.sol/Aggregator.json',
};

const contractCodeByName = {
  LegacyClaimsData: 'CD',
  LegacyClaims: 'CL',
  LegacyClaimsReward: 'CR',
  LegacyClaimProofs: 'CP',
  QuotationData: 'QD',
  Quotation: 'QT',
  PooledStaking: 'PS',
  TokenFunctions: 'TF',
  PriceFeedOracle: 'PRICEORACLE',
  TwapOracle: 'TWAP',
  CommunityStakingIncentives: 'CSI',
  DistributorFactory: 'DF',
  // external
  Aggregator: 'CHAINLINK-DAI-ETH',
  Dai: 'DAI',
  // v2
  TokenController: 'TC',
  SwapOperator: 'SO',
  Gateway: 'GW',
  TokenData: 'TD',
  MemberRoles: 'MR',
  NXMaster: 'NXMASTER',
  NXMToken: 'NXMTOKEN',
  ProposalCategory: 'PC',
  Governance: 'GV',
  MCR: 'MC',
  IndividualClaims: 'IC',
  YieldTokenIncidents: 'YT',
  Assessment: 'AS',
  Cover: 'CO',
  Pool: 'P1',
};

const rootPath = path.normalize(`${__dirname}/../`);
const addresses = require(`${rootPath}/deploy/mainnet-input.json`);

const getContractAbi = code => {
  const artifactPath = `${rootPath}/artifacts/${artifactByCode[code]}`;
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  return JSON.stringify(artifact.abi);
};

const versionData = Object.keys(addresses).map(name => {
  const address = addresses[name];

  if (ethers.utils.getAddress(address) !== address) {
    console.log(`Invalid address checksum for ${name}: ${address}`);
    process.exit(1);
  }

  return {
    code: contractCodeByName[name],
    address,
    contractName: name,
    contractAbi: getContractAbi(contractCodeByName[name]),
  };
});

if (!fs.existsSync(`${rootPath}/deploy`)) {
  fs.mkdirSync(`${rootPath}/deploy`);
}

const outfile = `${rootPath}/deploy/mainnet-data.json`;

fs.writeFileSync(outfile, JSON.stringify({ mainnet: { abis: versionData } }, null, 2));

console.log(`${path.basename(outfile)} generated succesfully`);
