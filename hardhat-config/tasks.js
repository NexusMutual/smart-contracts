const { task } = require('hardhat/config');
const { TASK_TYPECHAIN } = require('@typechain/hardhat/dist/constants');
const { TASK_COMPILE, TASK_TEST_SETUP_TEST_ENVIRONMENT } = require('hardhat/builtin-tasks/task-names');

task(TASK_TEST_SETUP_TEST_ENVIRONMENT, async (_, hre) => {
  const accounts = await hre.ethers.getSigners();
  hre.accounts = {
    defaultSender: accounts[0],
    nonMembers: accounts.slice(1, 5),
    members: accounts.slice(5, 10),
    advisoryBoardMembers: accounts.slice(10, 15),
    internalContracts: accounts.slice(15, 20),
    nonInternalContracts: accounts.slice(20, 25),
    governanceContracts: accounts.slice(25, 30),
    stakingPoolManagers: accounts.slice(30, 35),
    emergencyAdmin: accounts[35],
    generalPurpose: accounts.slice(36),
  };
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
