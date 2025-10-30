const path = require('node:path');

const { artifacts, ethers, run } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const linker = require('solc/linker');
const workerpool = require('workerpool');

const { AbiCoder } = ethers;

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;
const Position = {
  start: 'start',
  end: 'end',
  any: 'any',
};

const defaultAbiCoder = AbiCoder.defaultAbiCoder();

const usage = () => {
  console.log(`
    Usage:
      create2-find-salt [OPTION] CONTRACT_NAME

      CONTRACT_NAME is the contract you want to deploy.

    Options:
      --search-text, -t HEXSTRING
        Search for HEXSTRING in the resulting address. Default: 0000.
      --ignore-case, -i
        Ignore case when searching the hex string.
      --factory-address, -f ADDRESS
        Address of the contract that will call the CREATE2 opcode. This is a required parameter.
      --search-position, -p POSITION
        Look for given text at this position. POSITION can be 'start', 'end' or 'any'. Default: start.
      --constructor-args, -c ARGS
        Contract's constructor arguments. If there's more than one argument ARGS should be a valid JSON array.
      --salt, -s SALT
        Start the search from this salt.
      --help, -h
        Print this help message.
      --library, -l CONTRACT_NAME:ADDRESS
        Link an external library.
  `);
};

const parseArgs = async args => {
  const opts = {
    search: '0000',
    position: Position.start,
    ignoreCase: false,
    constructorArgs: [],
    salt: 0,
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

    if (['--search-text', '-t'].includes(arg)) {
      opts.search = argsArray.shift();
      if (opts.search.match(/[^a-f0-9]/i)) {
        throw new Error(`Invalid hex string: ${opts.search}`);
      }
      continue;
    }

    if (['--search-position', '-p'].includes(arg)) {
      opts.position = argsArray.shift();
      const valid = [Position.start, Position.end, Position.any];
      if (!valid.includes(opts.position)) {
        throw new Error(`Invalid position: ${opts.position}. Valid options are: start, end, any`);
      }
      continue;
    }

    if (['--ignore-case', '-i'].includes(arg)) {
      opts.ignoreCase = true;
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

    if (['--factory-address', '-f'].includes(arg)) {
      opts.factory = argsArray.shift();
      if (!(opts.factory || '').match(ADDRESS_REGEX)) {
        throw new Error(`Invalid factory address: ${opts.factory}`);
      }
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

  if (positionalArgs.length === 0) {
    throw new Error('Missing required positional argument: contract name');
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

  const constructorArgs = defaultAbiCoder.encode(constructorAbi.inputs, options.constructorArgs);

  return `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;
};

// TODO: consider moving the worker function to this file

async function main() {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const deploymentBytecode = await getDeploymentBytecode(opts).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  const factory = opts.factory.slice(-40);
  const bytecode = hexToBytes(deploymentBytecode.replace(/^0x/i, ''));
  const bytecodeHash = bytesToHex(keccak256(bytecode));

  const config = {
    bytecodeHash,
    factory,
    search: opts.ignoreCase ? opts.search.toLowerCase() : opts.search,
    position: opts.position,
    ignoreCase: opts.ignoreCase,
  };

  const pool = workerpool.pool(path.join(__dirname, 'worker.js'));
  const batchSize = 1000;
  let salt = opts.salt;
  let processed = salt;

  const crunch = async () => {
    await pool
      .exec('worker', [config, salt++, batchSize])
      .then(results => {
        process.stdout.write(`\rProcessed ${(processed += batchSize)} salts`);
        for (const result of results) {
          console.log(`\rAddress: ${result.address}   Salt: ${result.salt}`);
        }
      })
      .catch(err => console.error(`Worker error: ${err.message}`))
      .then(crunch);
  };

  // fill the queue with 64 jobs
  for (let i = 0; i < 64; i++) {
    crunch();
  }

  // sleep forever to prevent early exit
  await new Promise(() => 0);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
