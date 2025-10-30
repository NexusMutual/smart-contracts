const path = require('node:path');
const workerpool = require('workerpool');

const usage = () => {
  console.log(`
    Usage:
      node find-address.js [OPTION] [TARGET_PREFIX]

      TARGET_PREFIX is the hex string you want at the start of the contract address. Default: cafea.

    Options:
      --ignore-case, -i
        Ignore case when searching the hex string. By default, matching is case-sensitive.
      --batch-size, -b SIZE
        Number of addresses to check per worker batch. Default: 1000.
      --workers, -w COUNT
        Number of parallel worker jobs to run. Default: 64.
      --help, -h
        Print this help message.

    Examples:
      node find-address.js cafea              # Case-sensitive: matches 0xcafea... but NOT 0xcAfEa...
      node find-address.js -i CAFEA           # Case-insensitive: matches any case variation
      node find-address.js -w 128 -b 2000 cafe  # Custom workers and batch size
  `);
};

const parseArgs = args => {
  const opts = {
    search: 'cafea',
    ignoreCase: false,
    batchSize: 1000,
    workers: 64,
  };

  const argsArray = args.slice(2);

  while (argsArray.length) {
    const arg = argsArray.shift();

    if (['--help', '-h'].includes(arg)) {
      usage();
      process.exit(0);
    }

    if (['--ignore-case', '-i'].includes(arg)) {
      opts.ignoreCase = true;
      continue;
    }

    if (['--batch-size', '-b'].includes(arg)) {
      opts.batchSize = parseInt(argsArray.shift(), 10);
      if (isNaN(opts.batchSize) || opts.batchSize <= 0) {
        throw new Error('Invalid batch size');
      }
      continue;
    }

    if (['--workers', '-w'].includes(arg)) {
      opts.workers = parseInt(argsArray.shift(), 10);
      if (isNaN(opts.workers) || opts.workers <= 0) {
        throw new Error('Invalid worker count');
      }
      continue;
    }

    // target prefix
    opts.search = arg;
  }

  // Validate hex string
  if (opts.search.match(/[^a-f0-9]/i)) {
    throw new Error(`Invalid hex string: ${opts.search}`);
  }

  return opts;
};

async function main() {
  const opts = parseArgs(process.argv);

  const config = {
    search: opts.search,
    ignoreCase: opts.ignoreCase,
  };

  console.log(`Searching for contract addresses starting with: 0x${opts.search}`);
  console.log(`Case-sensitive: ${!opts.ignoreCase}`);
  console.log(`Running ${opts.workers} parallel workers, ${opts.batchSize} attempts per batch\n`);

  const pool = workerpool.pool(path.join(__dirname, 'worker.js'));
  let totalProcessed = 0;

  const crunch = async () => {
    await pool
      .exec('worker', [config, opts.batchSize])
      .then(results => {
        totalProcessed += opts.batchSize;
        process.stdout.write(`\rProcessed ${totalProcessed} addresses...`);

        for (const result of results) {
          console.log(`\nContract Address: ${result.contractAddress}`);
          console.log(`Deployer Address: ${result.deployerAddress}`);
          console.log(`Private Key:      ${result.privateKey}`);
        }
      })
      .catch(err => console.error(`\nWorker error: ${err.message}`))
      .then(crunch);
  };

  // Fill the queue with worker jobs
  for (let i = 0; i < opts.workers; i++) {
    crunch();
  }

  // Prevent early exit
  await new Promise(() => 0);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
