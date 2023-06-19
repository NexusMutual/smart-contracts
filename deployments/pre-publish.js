const fs = require('node:fs');
const path = require('node:path');
const { artifacts, config, run } = require('hardhat');

const rootPath = config.paths.root;
const contractList = [
  'Assessment',
  'Cover',
  'CoverMigrator',
  'CoverNFTDescriptor',
  'CoverNFT',
  'CoverViewer',
  ['Aggregator', 'EACAggregatorProxy'],
  ['@openzeppelin/contracts/token/ERC20/ERC20.sol:ERC20', 'ERC20'],
  'Governance',
  'IndividualClaims',
  'LegacyClaimProofs',
  'LegacyClaimsData',
  'LegacyClaimsReward',
  'LegacyGateway',
  'LegacyPooledStaking',
  'LegacyQuotationData',
  'MCR',
  'MemberRoles',
  'NXMaster',
  'NXMToken',
  'Pool',
  'PriceFeedOracle',
  'ProductsV1',
  'ProposalCategory',
  'StakingNFTDescriptor',
  'StakingNFT',
  'StakingPoolFactory',
  'StakingPool',
  'StakingProducts',
  'StakingViewer',
  'SwapOperator',
  'TokenController',
  'YieldTokenIncidents',
];

const updateVersion = () => {
  const rootPackageJson = path.join(rootPath, 'package.json');
  const deploymentsPackageJson = path.join(rootPath, 'deployments/package.json');

  const { version } = require(rootPackageJson);
  const deploymentJson = require(path.join(deploymentsPackageJson));

  const updatedJson = JSON.stringify({ ...deploymentJson, version }, null, 2);
  fs.writeFileSync(deploymentsPackageJson, updatedJson + '\n');

  return version;
};

const rimraf = file => {
  if (!fs.existsSync(file)) {
    return;
  }

  if (fs.lstatSync(file).isDirectory()) {
    fs.readdirSync(file).forEach(item => rimraf(path.join(file, item)));
    fs.rmdirSync(file);
    return;
  }

  fs.unlinkSync(file);
};

const generateExports = () => {
  // input
  const addressesPath = path.join(__dirname, 'src/addresses.json');

  // output
  const abiExportsDir = path.join(__dirname, 'dist/abis');
  const abiExportsFile = path.join(__dirname, 'dist/abis.js');
  const addressesExportsFile = path.join(__dirname, 'dist/addresses.js');
  const entrypointExportsFile = path.join(__dirname, 'dist/index.js');

  rimraf(abiExportsDir);
  fs.mkdirSync(abiExportsDir, { recursive: true });

  const abis = contractList.map(contract => {
    const [, exportedName] = contract;
    return typeof contract === 'string' ? contract : exportedName;
  });

  // make pairs of [filename, exportedName]
  const pairs = contractList.map(contract => (typeof contract === 'string' ? [contract, contract] : contract));

  for (const contract of pairs) {
    const [contractName, exportedName] = contract;
    const artifact = artifacts.readArtifactSync(contractName);
    const abi = JSON.stringify(artifact.abi, null, 2);
    fs.writeFileSync(path.join(abiExportsDir, `${exportedName}.js`), `module.exports = ${abi.trim()};\n`);
  }

  const imports = abis.map(contract => `const ${contract} = require('./abis/${contract}.js');`);
  const moduleExports = `module.exports = {\n${abis.map(contract => `  ${contract},`).join('\n')}\n};`;
  fs.writeFileSync(abiExportsFile, [...imports, '', moduleExports, ''].join('\n'));

  const addresses = fs.readFileSync(addressesPath).toString().trim().replace(/"/g, "'");
  fs.writeFileSync(addressesExportsFile, `module.exports = ${addresses};\n`);

  const entrypointExports = [
    `const abis = require('./abis.js');`,
    `const addresses = require('./addresses.js');`,
    `module.exports = { abis, addresses };`,
    '',
  ].join('\n');

  fs.writeFileSync(entrypointExportsFile, entrypointExports);
};

const main = async () => {
  console.log('Recompiling contracts');
  await run('compile');

  console.log('Updating package version');
  const version = updateVersion();
  console.log('Updated deployments/package.json with version: ', version);

  console.log('Generating exports');
  generateExports();

  console.log('Done');
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
