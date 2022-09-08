const fs = require('fs');
const path = require('path');
const getVersionDataTemplate = require('./version-data-template');

const network = 'localhost';
const rootPath = path.normalize(path.join(__dirname, '..'));
const deployPath = `${rootPath}/deploy`;
const contractsBasePath = `${rootPath}/artifacts/contracts`;

const deployData = JSON.parse(fs.readFileSync(`${deployPath}/${network}-deploy-data.json`, 'utf8'));

const nonProxies = Object.keys(deployData)
  .filter(
    // Temporary fix until DisposableMCR is replaced by the actual MCR
    x =>
      !/^Disposable|^Testnet|^ERC20MintableDetailed|^OwnedUpgradeabilityProxy/.test(x) ||
      /^DisposableMCR/.test(x) ||
      /^TestnetQuotationData/.test(x),
  )
  .reduce((acc, name) => {
    const { address } = deployData[name][0];
    if (name === 'DisposableMCR') {
      // Temporary fix until DisposableMCR is replaced by the actual MCR
      acc.MCR = address;
      return acc;
    }
    if (name === 'TestnetQuotationData') {
      acc.QuotationData = address;
      return acc;
    }
    acc[name] = address;
    return acc;
  }, {});

const tokenNames = ['DAI', 'stETH'];
const tokens = deployData.ERC20MintableDetailed.reduce((acc, x, i) => {
  const name = tokenNames[i];
  acc[name] = x.address;
  return acc;
}, {});

const proxies = deployData.OwnedUpgradeabilityProxy.reduce((acc, x) => {
  const name = x.name.replace('Disposable', '');
  acc[name] = x.address;
  return acc;
}, {});

const addresses = {
  ...nonProxies,
  ...tokens,
  ...proxies,
};
console.log({ addresses });

fs.writeFileSync(`${deployPath}/${network}-addresses.json`, JSON.stringify(addresses, null, 2));

const artifactPathOfContractCode = {
  // LCD: 'modules/claims/LegacyClaimsData.sol/LegacyClaimsData.json',
  // LCL: 'modules/claims/LegacyClaims.sol/LegacyClaims.json',
  CR: 'modules/legacy/LegacyClaimsReward.sol/LegacyClaimsReward.json',
  // LCP: 'modules/claims/LegacyClaimProofs.sol/LegacyClaimProofs.json',
  CL: 'modules/cover/CoverMigrator.sol/CoverMigrator.json',
  GV: 'modules/governance/Governance.sol/Governance.json',
  MC: 'modules/capital/MCR.sol/MCR.json',
  MR: 'modules/governance/MemberRoles.sol/MemberRoles.json',
  NXMASTER: 'modules/governance/NXMaster.sol/NXMaster.json',
  NXMTOKEN: 'modules/token/NXMToken.sol/NXMToken.json',
  P1: 'modules/capital/Pool.sol/Pool.json',
  PC: 'modules/governance/ProposalCategory.sol/ProposalCategory.json',
  QD: 'mocks/Testnet/TestnetQuotationData.sol/TestnetQuotationData.json',
  // QT: 'modules/cover/Quotation.sol/Quotation.json',
  TC: 'modules/token/TokenController.sol/TokenController.json',
  // TD: 'modules/token/TokenData.sol/TokenData.json',
  PS: 'modules/legacy/LegacyPooledStaking.sol/LegacyPooledStaking.json',
  GW: 'modules/legacy/LegacyGateway.sol/LegacyGateway.json',
  SO: 'modules/capital/CowSwapOperator.sol/CowSwapOperator.json',
  CO: 'modules/cover/Cover.sol/Cover.json',
  IC: 'modules/assessment/IndividualClaims.sol/IndividualClaims.json',
  YT: 'modules/assessment/YieldTokenIncidents.sol/YieldTokenIncidents.json',
  AS: 'modules/assessment/Assessment.sol/Assessment.json',
  SP: 'modules/staking/StakingPool.sol/StakingPool.json',
};

const contractNameByCode = {
  CR: 'LegacyClaimsReward',
  GV: 'Governance',
  MC: 'MCR',
  CL: 'CoverMigrator',
  MR: 'MemberRoles',
  NXMASTER: 'NXMaster',
  NXMTOKEN: 'NXMToken',
  P1: 'Pool',
  PC: 'ProposalCategory',
  PD: 'PoolData',
  QD: 'QuotationData',
  QT: 'Quotation',
  TC: 'TokenController',
  TD: 'TokenData',
  PS: 'PooledStaking',
  GW: 'Gateway',
  SO: 'CowSwapOperator',
  CO: 'Cover',
  IC: 'IndividualClaims',
  YT: 'YieldTokenIncidents',
  AS: 'Assessment',
  SP: 'CoverMockStakingPool',
};

const getContractAbi = code => {
  const artifact = JSON.parse(fs.readFileSync(`${contractsBasePath}/${artifactPathOfContractCode[code]}`, 'utf8'));
  return JSON.stringify(artifact.abi);
};

const versionDataTemplate = getVersionDataTemplate(network);
const versionData = [];

for (const contract of versionDataTemplate) {
  if (!contract.contractAbi) {
    console.log({ code: contract.code });
    const contractAbi = getContractAbi(contract.code);
    if (!fs.existsSync(deployPath + '/' + network)) {
      fs.mkdirSync(deployPath + '/' + network);
    }
    fs.writeFileSync(
      `${deployPath}/${network}/${contractNameByCode[contract.code]}.json`,
      JSON.stringify(contractAbi, null, 2),
    );
    console.log({ code: contract.code });
    const address = addresses[contractNameByCode[contract.code]].toLowerCase();
    versionData.push({ ...contract, address, contractAbi });
  }
}

if (!fs.existsSync(deployPath)) {
  fs.mkdirSync(deployPath);
}

fs.writeFileSync(`${deployPath}/${network}-data.json`, JSON.stringify({ [network]: { abis: versionData } }, null, 2));
