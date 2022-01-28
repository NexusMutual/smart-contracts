const { artifacts, ethers, run } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const workerpool = require('workerpool');

const Position = {
  start: 'start',
  end: 'end',
  any: 'any',
};

const usage = () => {
  console.log(`
    Usage:
      create2-find-nonce [OPTION] CONTRACT HEXSTRING

      CONTRACT is the name of the target contract.
      HEXSTRING is text that should be found in the resulting address. Default: 0000.

    Options:
      --factory-address, -f ADDRESS
        Address of the contract that will call the CREATE2 opcode. This argument is required.
      --search-position, -p POSITION
        Look for given text at this position. POSITION can be 'start', 'end' or 'any'. Default: start.
      --ignore-case, -i
        Ignore case when searching the hex string.
      --constructor-args, -c ARGS
        Contract's constructor arguments. If there's more than one argument ARGS should be a valid JSON array.
      --nonce, -n NONCE
        Start the search from this nonce.
      --help, -h
        Print this help message.
  `);
};

const parseArgs = async args => {

  const opts = {
    search: '0000',
    position: Position.start,
    ignoreCase: false,
    constructorArgs: [],
    nonce: 0,
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
      opts.constructorArgs = value.match(/^\[/)
        ? JSON.parse(value)
        : [value];
      continue;
    }

    if (['--nonce', '-n'].includes(arg)) {
      opts.nonce = parseInt(argsArray.shift(), 10);
      continue;
    }

    if (['--factory', '-f'].includes(arg)) {
      opts.factory = argsArray.shift();
      if (!(opts.factory || '').match(/0x[a-f0-9]{40}/i)) {
        throw new Error(`Invalid factory address: ${opts.factory}`);
      }
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

  const { abi, bytecode } = await artifacts.readArtifact(options.contract);

  // FIXME: implement library linking
  if (bytecode.includes('__$')) {
    throw new Error('Library linking is not implemented yet');
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

  const constructorArgs = ethers.utils.defaultAbiCoder.encode(
    constructorAbi.inputs,
    options.constructorArgs,
  );

  return `${bytecode}${constructorArgs.replace(/^0x/i, '')}`;
};

// TODO: consider moving the worker function to this file

async function main () {

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  const opts = await parseArgs(process.argv)
    .catch(err => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });

  const deploymentBytecode = await getDeploymentBytecode(opts)
    .catch(err => {
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

  const pool = workerpool.pool(`${__dirname}/worker.js`);
  const batchSize = 1000;
  let nonce = opts.nonce;
  let processed = 0;

  const crunch = async () => {

    await pool.exec('worker', [config, nonce++, batchSize])
      .then(results => {
        process.stdout.write(`\rProcessed ${processed += batchSize} nonces`);
        for (const result of results) {
          console.log(`\rAddress: ${result.address}   Salt: ${result.nonce}`);
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
