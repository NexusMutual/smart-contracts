const { task } = require('hardhat/config');
const { TASK_TYPECHAIN } = require('@typechain/hardhat/dist/constants');
const { TASK_COMPILE } = require('hardhat/builtin-tasks/task-names');

task('test', async (args, hre, runSuper) => {
  const testFiles = args.testFiles.length ? args.testFiles : ['test/index.js'];
  await runSuper({ ...args, testFiles });
});

task('test:setup-test-environment', async (_, hre) => {
  hre.accounts = await hre.web3.eth.getAccounts();
});

task(TASK_TYPECHAIN, async (args, hre, runSuper) => {
  hre.config.typechain.dontOverrideCompile = false;
  await runSuper();
});

task(TASK_COMPILE)
  .addFlag('generateStorageLayout', 'Generate storage layout')
  .setAction(async function ({ generateStorageLayout }, hre, runSuper) {
    if (!generateStorageLayout) {
      return runSuper();
    }

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
