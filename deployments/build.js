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
  'Ramm',
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

const generateAbisTs = () => {
  const outDir = path.join(__dirname, 'generated');

  const contractNames = contractList.map(contract => (typeof contract === 'string' ? contract : contract[1]));

  const imports = contractNames.map(name => `import ${name} from './abis/${name}.json';`);
  const exports = contractNames.map(name => `export { default as ${name} } from './abis/${name}.json';`);
  const dict = `export const abis = {\n  ${contractNames.join(',\n  ')}\n};`;

  const content = [...imports, ...exports, dict].join('\n') + '\n';

  fs.writeFileSync(path.join(outDir, 'abis.ts'), content);
};

const main = async () => {
  rimraf(path.join(__dirname, './deployments/dist'));
  rimraf(path.join(__dirname, './deployments/generated'));

  console.log('Recompiling contracts');
  await run('compile');

  console.log('Updating package version');
  const version = updateVersion();
  console.log('Updated deployments/package.json with version: ', version);

  console.log('Generating exports');
  generateExports();
  generateAbisTs();

  console.log('Building source');
  await build({
    entry: ['deployments/src/index.ts'],
    outDir: 'deployments/dist',
    format: ['cjs', 'esm'],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    publicDir: 'generated', // copy generated files to dist
  });

  // Create dist/data folder
  const distDataDir = path.join(__dirname, 'dist/data');
  fs.mkdirSync(distDataDir, { recursive: true });

  // Copy addresses.json to dist/data
  fs.copyFileSync(path.join(__dirname, 'src/addresses.json'), path.join(distDataDir, 'addresses.json'));

  // Copy generated abis to dist/data
  const abisSrcDir = path.join(__dirname, './generated/abis/');
  const abisOutDir = path.join(distDataDir, 'abis/');
  fs.mkdirSync(abisOutDir, { recursive: true });
  const abiDirents = await fs.promises.readdir(abisSrcDir, { withFileTypes: true });
  for (const dirent of abiDirents) {
    if (dirent.isFile()) {
      const source = path.join(abisSrcDir, dirent.name);
      const dest = path.join(abisOutDir, dirent.name);
      fs.copyFileSync(source, dest);
    }
  }

  console.log('Done');
};

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
