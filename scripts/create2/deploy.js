const { artifacts, ethers, nexus, run } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const linker = require('solc/linker');

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;

const usage = () => {
  console.log(`
    Usage:
      create2-deploy [OPTIONS] CONTRACT_NAME

      CONTRACT_NAME is the contract you want to deploy.

    Options:
      --address, -a ADDRESS
        Expected deployment address. This is a required parameter.
      --factory-address, -f ADDRESS
        Address of the contract that will call the CREATE2 opcode. This is a required parameter.
      --constructor-args, -c ARGS
        Contract's constructor arguments. If there's more than one parameter ARGS should be a valid JSON array.
      --salt, -s SALT
        Use this salt for CREATE2. This is a required parameter.
      --base-fee, -b BASE_FEE
        [gas price] Base fee in gwei. This is a required parameter.
      --priority-fee, -p MINER_TIP
        [gas price] Miner tip in gwei. Default: 2 gwei. This is a required parameter.
      --gas-limit, -g GAS_LIMIT
        Gas limit for the tx.
      --kms, -k
        Use AWS KMS to sign the transaction.
      --library, -l CONTRACT_NAME:ADDRESS
        Link an external library.
      --help, -h
        Print this help message.
  `);
};

const parseArgs = async args => {
  const opts = {
    constructorArgs: [],
    kms: false,
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

    if (['--kms', '-k'].includes(arg)) {
      opts.kms = true;
      continue;
    }

    if (['--address', '-a'].includes(arg)) {
      opts.address = args.shift();
      if (!opts.address.match(ADDRESS_REGEX)) {
        throw new Error(`Invalid address: ${opts.address}`);
      }
      continue;
    }

    if (['--factory-address', '-f'].includes(arg)) {
      opts.factory = args.shift();
      if (!(opts.factory || '').match(ADDRESS_REGEX)) {
        throw new Error(`Invalid factory address: ${opts.factory}`);
      }
      continue;
    }

    if (['--constructor-args', '-c'].includes(arg)) {
      const value = args.shift();
      opts.constructorArgs = value.match(/^\[/) ? JSON.parse(value) : [value];
      continue;
    }

    if (['--salt', '-s'].includes(arg)) {
      opts.salt = parseInt(args.shift(), 10);
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

    if (['--library', '-l'].includes(arg)) {
      const libArg = args.shift();

      const [contractName, address] = libArg.split(':');
      if (!contractName || !address || !address.match(ADDRESS_REGEX)) {
        throw new Error(`Invalid library format: ${libArg}. Expected format is CONTRACT_NAME:ADDRESS`);
      }

      const { sourceName } = await artifacts.readArtifact(contractName);
      opts.libraries[`${sourceName}:${contractName}`] = address;

      continue;
    }

    positionalArgs.push(arg);
  }

  if (typeof opts.factory === 'undefined') {
    throw new Error('Missing required argument: factory address');
  }

  if (typeof opts.salt === 'undefined') {
    throw new Error('Missing required argument: salt');
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

/**
 * Get deployment bytecode with encoded constructor arguments
 * @param {object} options - Options object containing contract, constructorArgs, and libraries
 * @returns {Promise<Uint8Array>} Deployment bytecode as bytes with encoded constructor args
 */
const getDeploymentBytecode = async options => {
  const { abi, bytecode: initialBytecode } = await artifacts.readArtifact(options.contract);

  const bytecode = initialBytecode.includes('__$')
    ? linker.linkBytecode(initialBytecode, options.libraries)
    : initialBytecode;

  if (bytecode.includes('__$')) {
    throw new Error('Missing external library address link. Please use --library, -l option');
  }

  const constructorAbi = abi.find(({ type }) => type === 'constructor');

  if (typeof constructorAbi === 'undefined' && options.constructorArgs.length > 0) {
    throw new Error('The target contract has no constructor but constructor arguments were provided');
  }

  if (typeof constructorAbi === 'undefined') {
    return hexToBytes(bytecode.replace(/^0x/i, ''));
  }

  if (constructorAbi.inputs.length !== options.constructorArgs.length) {
    throw new Error(
      `The contract requires ${constructorAbi.inputs.length} constructor argument(s) ` +
        `but ${options.constructorArgs.length} were provided`,
    );
  }

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const constructorArgs = abiCoder.encode(constructorAbi.inputs, options.constructorArgs);
  const deploymentBytecode = `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;

  return hexToBytes(deploymentBytecode.replace(/^0x/i, ''));
};

/**
 * Calculate CREATE2 address from factory, salt, and bytecode
 * @param {string} factoryAddress - Address of the CREATE2 factory
 * @param {number} salt - Salt value for CREATE2
 * @param {Uint8Array} bytecode - Deployment bytecode as bytes (including constructor args)
 * @returns {string} Calculated CREATE2 address
 */
const calculateCreate2Address = (factoryAddress, salt, bytecode) => {
  const factory = factoryAddress.slice(-40);
  const bytecodeHash = bytesToHex(keccak256(bytecode));

  // assemble input
  const saltHex = salt.toString(16).padStart(64, '0');
  const input = hexToBytes(`ff${factory}${saltHex}${bytecodeHash}`);
  const create2Hash = keccak256(input);
  const address = '0x' + bytesToHex(create2Hash.slice(32 - 20));

  return address;
};

async function main() {
  const opts = await parseArgs(process.argv.slice(2)).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const bytecode = await getDeploymentBytecode(opts).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  const address = calculateCreate2Address(opts.factory, opts.salt, bytecode);

  // check if the expected address is the same as resulting address
  if (address.toLowerCase() !== opts.address.toLowerCase()) {
    throw new Error(`Expected address to be ${opts.address} but got ${address}`);
  }

  const baseFee = ethers.parseUnits(opts.baseFee, 'gwei');
  const maxPriorityFeePerGas = ethers.parseUnits(opts.priorityFee, 'gwei');
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  const [signer] = opts.kms ? [nexus.awsKms.getSigner(ethers.provider)] : await ethers.getSigners();
  const deployer = await ethers.getContractAt('Deployer', opts.factory, signer);
  const deployTx = await deployer.deployAt(bytecode, opts.salt, opts.address, {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: opts.gasLimit,
  });

  console.log(`Waiting tx to be mined: https://etherscan.io/tx/${deployTx.hash}`);
  await deployTx.wait();

  console.log('Done!');
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('An unexpected error encountered:', error);
      process.exit(1);
    });
}

module.exports = {
  getDeploymentBytecode,
  calculateCreate2Address,
};
