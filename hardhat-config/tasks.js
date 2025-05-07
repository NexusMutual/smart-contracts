const { task } = require('hardhat/config');
const { TASK_TYPECHAIN } = require('@typechain/hardhat/dist/constants');
const { TASK_COMPILE, TASK_TEST_SETUP_TEST_ENVIRONMENT } = require('hardhat/builtin-tasks/task-names');

task(TASK_TEST_SETUP_TEST_ENVIRONMENT, (_, hre) => {
  hre.nexus = require('../lib');
});

task(TASK_TYPECHAIN, async (args, hre, runSuper) => {
  hre.config.typechain.dontOverrideCompile = false;
  await runSuper();
});

task(TASK_COMPILE).setAction(async function (_, hre, runSuper) {
  const { compilers, overrides } = hre.config.solidity;

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

  await runSuper();
});

task('coverage').setAction(async function (args, hre, runSuper) {
  hre.config.warnings = {
    ...hre.config.warnings,
    '*': 'warn',
  };
  return runSuper();
});
