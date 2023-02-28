require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

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
      --gas-limit, -l GAS_LIMIT
        Gas limit for the tx.
      --help, -h
        Print this help message.
  `);
};

const parseArgs = async args => {
  const opts = {
    constructorArgs: [],
    priorityFee: '2',
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

    if (['--address', '-a'].includes(arg)) {
      opts.address = argsArray.shift();
      if (opts.address.match(/^0x[^a-f0-9]{40}$/i)) {
        throw new Error(`Invalid address: ${opts.address}`);
      }
      continue;
    }

    if (['--factory-address', '-f'].includes(arg)) {
      opts.factory = argsArray.shift();
      if (!(opts.factory || '').match(/0x[a-f0-9]{40}/i)) {
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

    if (['--gas-limit', '-l'].includes(arg)) {
      opts.gasLimit = parseInt(argsArray.shift(), 10);
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

async function runAction(actionName, action) {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  // TODO: find best way to supply contract addresses in CLI
  let coverAddress;

  const [signer] = await ethers.getSigners();
  const { abi: coverABI } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));
  const cover = new ethers.Contract(coverAddress, coverABI, signer);

  console.log(`Running ${actionName}..`);

  await action({ cover, signer, opts });
}

module.exports = {
  runAction,
};
