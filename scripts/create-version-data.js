const fs = require('fs');
const getVersionDataBase = require('./version-data-base');

const network = process.argv[2];

const deployData = JSON.parse(fs.readFileSync('./artifacts/' + network + '-deploy-data.json', 'utf8'));

const nonProxies = Object.keys(deployData)
  .filter(
    // Temporary fix until DisposableMCR is replaced by the actual MCR
    x => !/^Disposable|^Testnet|^ERC20MintableDetailed|^OwnedUpgradeabilityProxy/.test(x) || /^DisposableMCR/.test(x),
  )
  .reduce((acc, name) => {
    const { address } = deployData[name][0];
    if (name === 'DisposableMCR') {
      // Temporary fix until DisposableMCR is replaced by the actual MCR
      acc.MCR = address;
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

fs.writeFileSync('./artifacts/' + network + '-addresses.json', JSON.stringify(addresses, null, 2));

const baseModulesPath = './artifacts/contracts/modules/';

const artifactPathOfContractCode = {
  CD: 'claims/ClaimsData.sol/ClaimsData.json',
  CL: 'claims/Claims.sol/Claims.json',
  CR: 'claims/ClaimsReward.sol/ClaimsReward.json',
  GV: 'governance/Governance.sol/Governance.json',
  MC: 'capital/MCR.sol/MCR.json',
  MR: 'governance/MemberRoles.sol/MemberRoles.json',
  NXMASTER: 'governance/NXMaster.sol/NXMaster.json',
  NXMTOKEN: 'token/NXMToken.sol/NXMToken.json',
  P1: 'capital/Pool.sol/Pool.json',
  PC: 'governance/ProposalCategory.sol/ProposalCategory.json',
  PD: 'capital/LegacyPoolData.sol/LegacyPoolData.json',
  QD: 'cover/QuotationData.sol/QuotationData.json',
  QT: 'cover/Quotation.sol/Quotation.json',
  TC: 'token/TokenController.sol/TokenController.json',
  TD: 'token/TokenData.sol/TokenData.json',
  TF: 'token/TokenFunctions.sol/TokenFunctions.json',
  PS: 'staking/PooledStaking.sol/PooledStaking.json',
  CP: 'claims/ClaimProofs.sol/ClaimProofs.json',
  GW: 'cover/Gateway.sol/Gateway.json',
  IC: 'claims/Incidents.sol/Incidents.json',
  SO: 'capital/SwapOperator.sol/SwapOperator.json',
};

const addressKeyOfContractCode = {
  CD: 'ClaimsData',
  CL: 'Claims',
  CR: 'ClaimsReward',
  GV: 'Governance',
  MC: 'MCR',
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
  TF: 'TokenFunctions',
  PS: 'PooledStaking',
  CP: 'ClaimProofs',
  GW: 'Gateway',
  IC: 'Incidents',
  SO: 'SwapOperator',
};

const getCotractAbi = code => {
  const artifact = JSON.parse(fs.readFileSync(baseModulesPath + artifactPathOfContractCode[code], 'utf8'));
  return JSON.stringify(artifact.abi);
};

const versionDataBase = getVersionDataBase(network);
const versionData = [];
for (const contract of versionDataBase) {
  if (!contract.contractAbi) {
    const contractAbi = getCotractAbi(contract.code);
    const address = addresses[addressKeyOfContractCode[contract.code]].toLowerCase();
    versionData.push({ ...contract, address, contractAbi });
  }
}
fs.writeFileSync(
  './artifacts/' + network + '-data.json',
  JSON.stringify({ [network]: { abis: versionData } }, null, 2),
);
