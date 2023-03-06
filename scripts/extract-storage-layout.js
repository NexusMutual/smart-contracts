const { artifacts, run } = require('hardhat');
const fs = require('fs');
const path = require('path');

async function main(outputFile) {
  console.log('Recompiling all contracts and generating storage layout...');
  await run('compile', { generateStorageLayout: true, force: true });

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

  main(outputFile)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
