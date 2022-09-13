const { task } = require('hardhat/config');

task('test', async (args, hre, runSuper) => {
  const testFiles = args.testFiles.length ? args.testFiles : ['test/index.js'];
  await runSuper({ ...args, testFiles });
});

task('test:setup-test-environment', async (_, hre) => {
  hre.accounts = await hre.web3.eth.getAccounts();
});
