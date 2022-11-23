const { task } = require('hardhat/config');
const { TASK_TYPECHAIN } = require('@typechain/hardhat/dist/constants');

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
