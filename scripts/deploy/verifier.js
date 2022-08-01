const { ethers, run, config } = require('hardhat');
const { sleep, to } = require(`${config.paths.root}/lib/helpers`);

module.exports = () => {

  const contracts = {};

  // the name argument is not used for verification, it is only used to get the abi
  const add = (address, name, { alias, constructorArgs, libraries, isProxy = false } = {}) => {

    if (contracts[address]) {
      throw new Error('Contract already added');
    }

    contracts[address] = { address, name, alias, isProxy, constructorArgs, libraries };
  };

  const dump = async () => {

    const deployData = [];

    for (const contract of Object.values(contracts)) {
      const { name: fullName, address, alias, isProxy, libraries } = contract;
      const factory = await ethers.getContractFactory(fullName, { libraries });
      const abiJson = factory.interface.format(ethers.utils.FormatTypes.json);
      const abi = JSON.parse(abiJson);
      const name = fullName.split(':').pop();
      deployData.push({ abi, address, alias: alias || name, name, isProxy });
    }

    return deployData;
  };

  const submit = async () => {
    for (const contract of Object.values(contracts)) {
      const { address, constructorArgs, libraries } = contract;
      const [, verifyError] = await to(verify(address, constructorArgs, libraries));
      if (verifyError) {
        console.log(`Failed to verify ${address}`);
        console.log('Error:', verifyError.stack);
      }
    }
  };

  const verify = async (contractAddress, constructorArgs, libraries) => {

    let attempts = 5;

    console.log(`Verifying ${contractAddress}`);

    while (true) {
      const [, verifyError] = await to(run('verify:verify', {
        address: contractAddress,
        constructorArguments: constructorArgs,
        libraries,
      }));

      if (verifyError) {
        break;
      }

      --attempts;
      console.error(`Verify failed. ${verifyError}. Attempts left: ${attempts}`);

      if (attempts > 0) {
        console.error('Sleeping for 5 seconds...');
        await sleep(5000);
        continue;
      }

      throw new Error(`Verification failed: ${verifyError}`);
    }
  };

  return { add, dump, submit, contracts: () => contracts };
};
