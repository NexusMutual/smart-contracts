const { artifacts, ethers, network, nexus, run } = require('hardhat');

const { CREATE1_PRIVATE_KEY } = process.env;
const { waitForInput } = nexus.helpers;
const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;

const usage = () => {
  console.log(`
    Usage:
      node deploy.js [OPTIONS] CONTRACT_NAME

    Options:
      --address, -a EXPECTED_ADDRESS
        Expected address of the contract
      --constructor-args, -c ARGS
        Contract's constructor arguments. If there's more than one parameter ARGS should be a valid JSON array.
      --library, -l CONTRACT_NAME:ADDRESS
        Link an external library.
      --base-fee, -b BASE_FEE
        [gas price] Base fee in gwei. This is a required parameter.
      --priority-fee, -p MINER_TIP
        [gas price] Miner tip in gwei. Default: 2 gwei. This is a required parameter.
      --gas-limit, -g GAS_LIMIT
        Gas limit for the tx.
      --help, -h
        Print this help message.

    Environment variables:
      CREATE1_PRIVATE_KEY - the private key of the account that will deploy the contract
  `);
};

const parseArgs = async args => {
  const opts = {
    constructorArgs: [],
    libraries: {},
    priorityFee: '2',
  };

  const positionalArgs = [];

  if (args.length === 0) {
    usage();
    process.exit(1);
  }

  while (args.length) {
    const arg = args.shift();

    if (['--help', '-h'].includes(arg)) {
      usage();
      process.exit();
    }

    if (['--address', '-a'].includes(arg)) {
      opts.address = args.shift();
      if (!opts.address.match(ADDRESS_REGEX)) {
        throw new Error(`Invalid address: ${opts.address}`);
      }
      continue;
    }

    if (['--constructor-args', '-c'].includes(arg)) {
      const value = args.shift();
      opts.constructorArgs = value.match(/^\[/) ? JSON.parse(value) : [value];
      continue;
    }

    if (['--base-fee', '-b'].includes(arg)) {
      opts.baseFee = args.shift();
      continue;
    }

    if (['--priority-fee', '-p'].includes(arg)) {
      opts.priorityFee = args.shift();
      continue;
    }

    if (['--gas-limit', '-g'].includes(arg)) {
      opts.gasLimit = parseInt(args.shift(), 10);
      continue;
    }

    if (['--gas-limit', '-g'].includes(arg)) {
      opts.gasLimit = parseInt(args.shift(), 10);
      continue;
    }

    if (['--library', '-l'].includes(arg)) {
      const libArg = args.shift();
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

  if (!opts.address) {
    throw new Error('Address argument is required');
  }

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

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const constructorArgs = abiCoder.encode(constructorAbi.inputs, options.constructorArgs);

  return `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;
};

async function main() {
  const opts = await parseArgs(process.argv.slice(2)).catch(e => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });

  if (!CREATE1_PRIVATE_KEY) {
    console.error('CREATE1_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  await run('compile');

  const deploymentBytecode = await getDeploymentBytecode(opts);
  const deployer = new ethers.Wallet(CREATE1_PRIVATE_KEY, ethers.provider);
  const actualAddress = ethers.getCreateAddress({ from: deployer.address, nonce: 0 });

  if (actualAddress.toLowerCase() !== opts.address.toLowerCase()) {
    console.error(`Address mismatch! Expected ${opts.address} but got ${actualAddress}`);
    process.exit(1);
  }

  const txCount = await ethers.provider.getTransactionCount(deployer.address);

  if (txCount > 0) {
    console.error('Deployer nonce not 0');
    process.exit(1);
  }

  const baseFee = ethers.parseUnits(opts.baseFee, 'gwei');
  const maxPriorityFeePerGas = ethers.parseUnits(opts.priorityFee, 'gwei');
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  console.log(`Deploying ${opts.contract}:${actualAddress} to ${network.name}`);
  await waitForInput('Press enter to continue...');

  const factory = new ethers.ContractFactory([], deploymentBytecode, deployer);
  const contract = await factory.deploy({
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: opts.gasLimit,
  });

  const deployTx = contract.deploymentTransaction();
  console.log(`Waiting for transaction to be mined: https://etherscan.io/tx/${deployTx.hash}`);

  await contract.waitForDeployment();

  console.log('Done!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
