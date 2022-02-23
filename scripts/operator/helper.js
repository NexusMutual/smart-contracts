const hre = require('hardhat');

const etherscanVerification = (contractAddress, args, exactContractPath) => {
  if (hre.network.name === 'local' || hre.network.name === 'local-ovm') {
    return;
  }

  return runTaskWithRetry(
    'verify:verify',
    {
      address: contractAddress,
      constructorArguments: args,
      contract: exactContractPath,
    },
    4,
    10000,
  );
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry is needed because the contract was recently deployed and it hasn't propagated to the explorer backend yet
const runTaskWithRetry = async (task, params, times, msDelay) => {
  let counter = times;
  await delay(msDelay);

  try {
    await hre.run(task, params);
  } catch (error) {
    counter--;

    if (counter > 0) {
      await runTaskWithRetry(task, params, counter, msDelay);
    } else {
      console.error('[ETHERSCAN][ERROR]', 'unable to verify', error.message);
    }
  }
};

module.exports = {
  etherscanVerification,
  runTaskWithRetry,
};
