const { artifacts, config, run } = require('hardhat');
const fs = require('fs');
const path = require('path');

// @dev This script is used by storage layout tests

async function main(outputFile) {
  const { compilers, overrides } = config.solidity;

  // add storageLayout to compilers if missing
  for (const compiler of compilers) {
    const output = compiler.settings.outputSelection['*']['*'];
    if (!output.includes('storageLayout')) {
      throw new Error('Storage layout generation was not included in the compiler settings');
    }
  }

  // add storageLayout to overrides if missing
  for (const source of Object.keys(overrides)) {
    const output = overrides[source].settings.outputSelection['*']['*'];
    if (!output.includes('storageLayout')) {
      throw new Error('Storage layout generation was not included in the compiler settings');
    }
  }

  // a build includes multiple source files
  // a source file can include multiple contracts
  const parseBuild = buildPath => {
    const build = require(buildPath);
    const buildSources = build.output.contracts;
    const sourceNames = Object.keys(buildSources).filter(sourceName => sourceName.startsWith('contracts/modules'));

    const contracts = sourceNames.flatMap(sourceName => {
      const source = buildSources[sourceName];
      const contractNames = Object.keys(source);
      return contractNames.map(contractName => ({ source, contractName }));
    });

    return contracts;
  };

  const parseContract = ({ contractName, source }) => {
    if (!source[contractName].storageLayout) {
      console.warn(`Missing storage layout for ${contractName}`);
    }

    const { storageLayout = {} } = source[contractName];
    const { storage = [], types } = storageLayout;

    const parsedStorage = storage.map(item => {
      const { label, slot, offset, type } = item;
      const size = Number(types[type].numberOfBytes);
      return { label, slot: Number(slot), offset: Number(offset), type, size };
    });

    return { contractName, storage: parsedStorage };
  };

  const builds = await artifacts.getBuildInfoPaths();
  const contracts = builds.flatMap(parseBuild).map(parseContract);

  const data = contracts
    .sort((a, b) => a.contractName.localeCompare(b.contractName))
    .reduce((acc, { contractName, storage }) => ({ ...acc, [contractName]: storage }), {});

  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2));
}

if (require.main === module) {
  const outputFile = process.argv[2];

  if (!outputFile) {
    console.log('Usage: node extract-storage-layout.js path/to/output.json');
    process.exit(1);
  }

  run('compile')
    .then(() => main(outputFile))
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
