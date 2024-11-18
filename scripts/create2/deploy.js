const { artifacts, ethers, run, network } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const linker = require('solc/linker');

const { getSigner } = require('./get-signer');
const { parseEther } = require('ethers/lib/utils');

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;

const usage = () => {
  console.log(`
    Usage:
      create2-deploy [OPTION] CONTRACT_NAME

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
      --help, -h
        Print this help message.
      --library, -l CONTRACT_NAME:ADDRESS
        Link an external library.
  `);
};

const parseArgs = async args => {
  const opts = {
    constructorArgs: [],
    priorityFee: '2',
    kms: false,
    libraries: {},
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

    if (['--kms', '-k'].includes(arg)) {
      opts.kms = true;
      continue;
    }

    if (['--address', '-a'].includes(arg)) {
      opts.address = argsArray.shift();
      if (!opts.address.match(ADDRESS_REGEX)) {
        throw new Error(`Invalid address: ${opts.address}`);
      }
      continue;
    }

    if (['--factory-address', '-f'].includes(arg)) {
      opts.factory = argsArray.shift();
      if (!(opts.factory || '').match(ADDRESS_REGEX)) {
        throw new Error(`Invalid factory address: ${opts.factory}`);
      }
      continue;
    }

    if (['--constructor-args', '-c'].includes(arg)) {
      const value = argsArray.shift();
      opts.constructorArgs = value.match(/^\[/) ? JSON.parse(value) : [value];
      continue;
    }

    if (['--salt', '-s'].includes(arg)) {
      opts.salt = parseInt(argsArray.shift(), 10);
      continue;
    }

    if (['--base-fee', '-b'].includes(arg)) {
      opts.baseFee = argsArray.shift();
      continue;
    }

    if (['--priority-fee', '-p'].includes(arg)) {
      opts.priorityFee = argsArray.shift();
      continue;
    }

    if (['--gas-limit', '-g'].includes(arg)) {
      opts.gasLimit = parseInt(argsArray.shift(), 10);
      continue;
    }

    if (['--library', '-l'].includes(arg)) {
      const libArg = argsArray.shift();

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
    return bytecode;
  }

  if (constructorAbi.inputs.length !== options.constructorArgs.length) {
    throw new Error(
      `The contract requires ${constructorAbi.inputs.length} constructor argument(s) ` +
        `but ${options.constructorArgs.length} were provided`,
    );
  }

  const constructorArgs = ethers.utils.defaultAbiCoder.encode(constructorAbi.inputs, options.constructorArgs);

  return `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;
};

/**
 * Creates a new snapshot or reverts to the given one
 * Also sets ETH balance on the given signer address
 */
async function tenderlySnapShot(address, ethBalance = '100') {
  if (network.name === 'tenderly') {
    const { TENDERLY_SNAPSHOT_ID } = process.env;
    if (TENDERLY_SNAPSHOT_ID) {
      await ethers.provider.send('evm_revert', [TENDERLY_SNAPSHOT_ID]);
      console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
    } else {
      const snapshotId = await ethers.provider.send('evm_snapshot', []);
      console.info(`Snapshot ID: ${snapshotId}`);
      process.env.TENDERLY_SNAPSHOT_ID = snapshotId;
    }
    await ethers.provider.send('tenderly_setBalance', [address, ethers.utils.hexValue(parseEther(ethBalance))]);
  }
}

async function main() {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  const signer = await getSigner(opts, network.name);

  await tenderlySnapShot(signer.address);
  await run('compile');

  const deploymentBytecode = await getDeploymentBytecode(opts).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  const factory = opts.factory.slice(-40);
  const bytecode = hexToBytes(deploymentBytecode.replace(/^0x/i, ''));
  const bytecodeHash = bytesToHex(keccak256(bytecode));

  const saltHex = opts.salt.toString(16).padStart(64, '0');
  const input = hexToBytes(`ff${factory}${saltHex}${bytecodeHash}`);
  const create2Hash = keccak256(input);
  const address = '0x' + bytesToHex(create2Hash.slice(32 - 20));

  if (address.toLowerCase() !== opts.address.toLowerCase()) {
    throw new Error(`Expected address to be ${opts.address} but got ${address}`);
  }

  const baseFee = ethers.utils.parseUnits(opts.baseFee, 'gwei');
  const maxPriorityFeePerGas = ethers.utils.parseUnits(opts.priorityFee, 'gwei');
  const maxFeePerGas = baseFee.add(maxPriorityFeePerGas);

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

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
