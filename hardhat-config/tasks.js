const fs = require('node:fs');
const path = require('node:path');

const { extendConfig, extendEnvironment, task } = require('hardhat/config');
const { TASK_TEST } = require('hardhat/builtin-tasks/task-names');
const { TASK_TYPECHAIN } = require('@typechain/hardhat/dist/constants');

extendEnvironment(hre => {
  hre.nexus = require('../lib');
});

extendConfig(config => {
  const { compilers, overrides } = config.solidity;

  // add storageLayout to compilers if missing
  for (const compiler of compilers) {
    const output = compiler.settings.outputSelection['*']['*'];
    if (!output.includes('storageLayout')) {
      output.push('storageLayout');
    }
  }

  // add storageLayout to overrides if missing
  for (const source of Object.keys(overrides)) {
    const output = overrides[source].settings.outputSelection['*']['*'];
    if (!output.includes('storageLayout')) {
      output.push('storageLayout');
    }
  }
});

task(TASK_TYPECHAIN, async (args, hre, runSuper) => {
  hre.config.typechain.dontOverrideCompile = false;
  await runSuper();
});

task('coverage').setAction(async function (args, hre, runSuper) {
  hre.config.warnings = {
    ...hre.config.warnings,
    '*': 'warn',
  };
  return runSuper();
});

task(TASK_TEST).setAction(async function (args, hre, runSuper) {
  args.testFiles = args.testFiles.flatMap(file => {
    // pass as is if it's a file
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      return [file];
    }

    // then try as a glob
    const items = fs.globSync(file);

    if (items.length === 0) {
      // if nothing matched - return the original path so it can gracefully fail down the pipeline
      return [file];
    }

    return items.flatMap(item => {
      return fs.statSync(item).isDirectory()
        ? fs.globSync(path.join(item, '**/*.js')) // scan for tests
        : [item]; // return as is
    });
  });

  return runSuper();
});
