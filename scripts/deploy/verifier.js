const { ethers, run, config } = require('hardhat');
const { sleep, to } = require(`${config.paths.root}/lib/helpers`);

module.exports = () => {
  const contracts = {};

  // fqName - actual deployed contract name (for verification). ex: OwnedUpgradeabilityProxy
  // implFqName - if proxy, the name of the implementation contract (for ui). ex: ERC20
  // abiFilename - will append ".json" and dump the abi there (for ui). ex: ERC20
  // alias - same contract can be deployed multiple times and refered to differently. ex: DAI
  const add = (address, fqName, options = {}) => {
    const { constructorArgs, libraries, isProxy } = options;
    const implFqName = options.implFqName || fqName;
    const shortImplName = implFqName.split(':').pop();
    const alias = options.alias || shortImplName;
    const abiFilename = options.abiFilename || shortImplName;

    if (contracts[address]) {
      const previousName = contracts[address].alias;
      console.log(`Replacing ${previousName} with ${alias} at ${address}`);
    }

    contracts[address] = { address, fqName, implFqName, abiFilename, alias, constructorArgs, libraries, isProxy };
  };

  const dump = async () => {
    const deployData = [];

    for (const contract of Object.values(contracts)) {
      const { implFqName, libraries } = contract;
      const factory = await ethers.getContractFactory(implFqName, { libraries });
      const abiJson = factory.interface.format(ethers.utils.FormatTypes.json);
      const abi = JSON.parse(abiJson);
      deployData.push({ ...contract, abi });
    }

    return deployData;
  };

  const getContractList = async () => {
    const contractList = [];

    for (const contract of Object.values(contracts)) {
      const { address, fqName, libraries } = contract;
      const shortName = fqName.split(':').pop();
      contractList.push({ address, name: shortName, libraries });
    }

    return contractList;
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
      const [, verifyError] = await to(
        run('verify:verify', {
          address: contractAddress,
          constructorArguments: constructorArgs,
          libraries,
        }),
      );

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

  return { add, dump, submit, contracts: () => contracts, getContractList };
};
