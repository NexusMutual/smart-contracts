const fs = require('node:fs');
const path = require('node:path');
const { artifacts, config, run } = require('hardhat');
const { build } = require('tsup');

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
  const abiExportsDir = path.join(__dirname, 'generated/abis');

  fs.mkdirSync(abiExportsDir, { recursive: true });

  for (const contract of contractList) {
    const [contractName, exportedName] = typeof contract === 'string' ? [contract, contract] : contract;
    const artifact = artifacts.readArtifactSync(contractName);
    const abi = JSON.stringify(artifact.abi, null, 2);
    fs.writeFileSync(path.join(abiExportsDir, `${exportedName}.json`), abi.trim());
  }
};

const main = async () => {
  rimraf(path.join(__dirname, './dist'));

  console.log('Recompiling contracts');
  await run('compile');

  console.log('Updating package version');
  const version = updateVersion();
  console.log('Updated deployments/package.json with version: ', version);

  console.log('Generating exports');
  generateExports();

  console.log('Building source');
  await build({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    publicDir: 'generated', // copy generated files to dist
  });

  // copy addresses.json to dist
  fs.copyFileSync(path.join(__dirname, 'src/addresses.json'), path.join(__dirname, 'dist/addresses.json'));

  console.log('Done');
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
