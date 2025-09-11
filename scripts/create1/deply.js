require('dotenv').config();
const { artifacts, ethers, run } = require('hardhat');
const { getCreateAddress } = ethers;
const axios = require('axios');

const TENDERLY_ACCESS_KEY = process.env.TENDERLY_ACCESS_KEY;
const MAINNET_PROVIDER_URL = process.env.MAINNET_PROVIDER_URL;
const CREATE1_PRIVATE_KEY = process.env.CREATE1_PRIVATE_KEY;

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;

const usage = () => {
  console.log(`
    Usage:
      node deply.js [OPTIONS] CONTRACT_NAME

      CONTRACT_NAME is the contract you want to deploy.

    Options:
      --address, -a 
        Expected address of the contract
      --constructor-args, -c ARGS
        Contract's constructor arguments. If there's more than one parameter ARGS should be a valid JSON array.
      --library, -l CONTRACT_NAME:ADDRESS
        Link an external library.
      --execute, -x
        Execute the deployment on mainnet (requires CREATE1_PRIVATE_KEY in .env).
      --gas-limit, -g GAS_LIMIT
        Gas limit for the transaction. Default: 8000000.
      --help, -h
        Print this help message.
      

    Environment Variables:
      TENDERLY_ACCESS_KEY - Required for simulation
      CREATE1_PRIVATE_KEY - Required for mainnet execution (-x option)
  `);
};

const parseArgs = async args => {
  const opts = {
    constructorArgs: [],
    libraries: {},
    execute: false,
    gasLimit: 8000000,
  };

  const argsArray = args.slice(2);
  const positionalArgs = [];

  if (argsArray.length === 0) {
    usage();
    process.exit(1);
  }

  while (argsArray.length) {
    const arg = argsArray.shift();

    if (['--help', '-h'].includes(arg)) {
      usage();
      process.exit();
    }

    if (['--execute', '-x'].includes(arg)) {
      opts.execute = true;
      continue;
    }

    if (['--address', '-a'].includes(arg)) {
      opts.address = argsArray.shift();
      if (!opts.address.match(ADDRESS_REGEX)) {
        throw new Error(`Invalid address: ${opts.address}`);
      }
      continue;
    }

    if (['--constructor-args', '-c'].includes(arg)) {
      const value = argsArray.shift();
      opts.constructorArgs = value.match(/^\[/) ? JSON.parse(value) : [value];
      continue;
    }

    if (['--gas-limit', '-g'].includes(arg)) {
      opts.gasLimit = parseInt(argsArray.shift(), 10);
      continue;
    }

    if (['--library', '-l'].includes(arg)) {
      const libArg = argsArray.shift();
      const [contractName, address] = libArg.split(':');

      if (!contractName || !address || !address.match(/^0x[a-f0-9]{40}$/i)) {
        throw new Error(`Invalid library format: ${libArg}. Expected format is CONTRACT_NAME:ADDRESS`);
      }

      const { sourceName } = await artifacts.readArtifact(contractName);
      opts.libraries[`${sourceName}:${contractName}`] = address;
      continue;
    }

    positionalArgs.push(arg);
  }

  if (positionalArgs.length === 0) {
    throw new Error('Missing required positional arguments: contract name');
  }

  if (positionalArgs.length > 1) {
    throw new Error('Too many arguments');
  }

  opts.contract = positionalArgs[0];

  return opts;
};

const getDeploymentBytecode = async options => {
  const { abi, bytecode: initialBytecode } = await artifacts.readArtifact(options.contract);

  const bytecode = initialBytecode.includes('__$')
    ? require('solc/linker').linkBytecode(initialBytecode, options.libraries)
    : initialBytecode;

  if (bytecode.includes('__$')) {
    throw new Error('Missing external library address link. Please use --library, -l option');
  }

  const constructorAbi = abi.find(({ type }) => type === 'constructor');

  if (typeof constructorAbi === 'undefined' && options.constructorArgs.length > 0) {
    throw new Error('The target contract has no constructor but constructor arguments were provided');
  }

  if (typeof constructorAbi === 'undefined') {
    return bytecode;
  }

  if (constructorAbi.inputs.length !== options.constructorArgs.length) {
    throw new Error(
      `The contract requires ${constructorAbi.inputs.length} constructor argument(s) ` +
        `but ${options.constructorArgs.length} were provided`,
    );
  }

  const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(constructorAbi.inputs, options.constructorArgs);
  return `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;
};

const simulateOnTenderly = async (contractName, deploymentBytecode, wallet, gasLimit) => {
  if (!TENDERLY_ACCESS_KEY) {
    console.error('TENDERLY_ACCESS_KEY not set');
    process.exit(1);
  }

  console.log('Simulating deployment on Tenderly...');

  const deployerAddress = wallet.address;
  const payload = {
    save: true,
    save_if_fails: true,
    simulation_type: 'full',
    network_id: '1',
    from: deployerAddress, // Use actual deployer address
    to: null, // Contract creation
    gas: gasLimit,
    gas_price: 0,
    value: 0,
    input: deploymentBytecode,
  };

  try {
    const response = await axios.post(
      `https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/simulate`,
      payload,
      { headers: { 'X-Access-Key': TENDERLY_ACCESS_KEY } },
    );
    const { simulation } = response.data;

    console.log(
      `Tenderly Simulation URL: https://dashboard.tenderly.co/NexusMutual/nexusmutual/simulator/${simulation.id}`,
    );

    return simulation;
  } catch (error) {
    console.error('Tenderly simulation failed:');
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error message:', error.message);
    }
    throw error;
  }
};

const deployToMainnet = async (contractName, deploymentBytecode, wallet, gasLimit) => {
  console.log('Deploying to mainnet...');

  // Connect to mainnet provider
  const provider = new ethers.JsonRpcProvider(MAINNET_PROVIDER_URL);
  const signer = wallet.connect(provider);
  const txCount = await provider.getTransactionCount(signer.address);

  if (txCount > 0) {
    console.error('Deployer nonce not 0');
    process.exit(1);
  }

  try {
    // Deploy the contract
    const factory = new ethers.ContractFactory([], deploymentBytecode, signer);
    const contract = await factory.deploy({
      gasLimit,
    });

    console.log('Waiting for deployment transaction to be mined...');

    await contract.deployed();

    console.log('Contract deployed successfully!');
    console.log(`Contract address: ${contract.address}`);
    console.log(`Contract on Etherscan: https://etherscan.io/address/${contract.address}`);

    return contract;
  } catch (error) {
    console.error('Mainnet deployment failed:', error.message);
    throw error;
  }
};

async function main() {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  if (!CREATE1_PRIVATE_KEY) {
    console.error('CREATE1_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  if (!opts.address) {
    console.error('Address variable is required');
    process.exit(1);
  }

  await run('compile');

  console.log(`Preparing to deploy contract: ${opts.contract}`);
  console.log(`Constructor args: ${JSON.stringify(opts.constructorArgs)}`);
  console.log(`Libraries: ${JSON.stringify(opts.libraries)}`);

  const deploymentBytecode = await getDeploymentBytecode(opts).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  const wallet = new ethers.Wallet(CREATE1_PRIVATE_KEY);
  const deployerAddress = wallet.address;
  const expectedAddress = getCreateAddress({ from: deployerAddress, nonce: 0 });

  if (expectedAddress.toLowerCase() !== opts.address.toLowerCase()) {
    console.error('Address mismatch! Expected and provided addresses do not match.');
    console.error(`Expected: ${expectedAddress}`);
    console.error(`Provided: ${opts.address}`);
    process.exit(1);
  }

  // Execute on mainnet if requested
  if (opts.execute) {
    try {
      await deployToMainnet(opts.contract, deploymentBytecode, wallet, opts.gasLimit);
    } catch (error) {
      console.error('Mainnet deployment failed');
      process.exit(1);
    }
  } else {
    try {
      const simulation = await simulateOnTenderly(opts.contract, deploymentBytecode, wallet, opts.gasLimit);
      if (simulation === null) {
        console.log('Skipping simulation due to missing TENDERLY_ACCESS_KEY');
      }
    } catch (error) {
      console.error('Simulation failed:', error.message);
      console.error('Full error:', error);
      process.exit(1);
    }
    console.log('To execute on mainnet, add the --execute (-x) flag');
  }

  console.log('Script completed successfully!');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
