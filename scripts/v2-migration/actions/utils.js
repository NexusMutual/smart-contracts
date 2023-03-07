require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const { toUtf8Bytes } = ethers.utils;

const MASTER_ADDRESS = '0x01BFd82675DBCc7762C84019cA518e701C0cD07e';

const usage = () => {
  console.log(`
    Usage:
      create2-deploy [OPTION] CONTRACT_NAME

      CONTRACT_NAME is the contract you want to deploy.

    Options:
      --nonce, -s NONCE
        This is an optional parameter for the nonce for the transaction.
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

    if (['--nonce', '-n'].includes(arg)) {
      opts.nonce = parseInt(argsArray.shift(), 10);
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

  if (typeof opts.baseFee === 'undefined') {
    throw new Error('Missing required argument: base-fee');
  }

  if (positionalArgs.length > 1) {
    throw new Error('Too many arguments');
  }

  return opts;
};

async function runAction(actionName, action) {
  const rawOpts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  console.log('Options: ', rawOpts);

  const baseFee = ethers.utils.parseUnits(rawOpts.baseFee, 'gwei');
  const maxPriorityFeePerGas = ethers.utils.parseUnits(rawOpts.priorityFee, 'gwei');
  const maxFeePerGas = baseFee.add(maxPriorityFeePerGas);

  const opts = {
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit: rawOpts.gasLimit,
    nonce: rawOpts.nonce,
  };

  const [signer] = await ethers.getSigners();

  const { abi: masterABI } = JSON.parse(
    fs.readFileSync('./artifacts/contracts/modules/governance/NXMaster.sol/NXMaster.json'),
  );
  const master = new ethers.Contract(MASTER_ADDRESS, masterABI, signer);

  // fetching all addresses to cover all cases - it's a small set.

  const coverAddress = await master.getLatestAddress(toUtf8Bytes('CO'));
  const { abi: coverABI } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));
  const cover = new ethers.Contract(coverAddress, coverABI, signer);

  const pooledStakingAddress = await master.getLatestAddress(toUtf8Bytes('PS'));
  const { abi: pooledStakingABI } = JSON.parse(
    fs.readFileSync('./artifacts/contracts/modules/legacy/LegacyPooledStaking.sol/LegacyPooledStaking.json'),
  );
  const legacyPooledStaking = new ethers.Contract(pooledStakingAddress, pooledStakingABI, signer);

  const claimsRewardAddress = await master.getLatestAddress(toUtf8Bytes('CR'));
  const { abi: claimsRewardABI } = JSON.parse(
    fs.readFileSync('./artifacts/contracts/modules/legacy/LegacyClaimsReward.sol/LegacyClaimsReward.json'),
  );
  const legacyClaimsReward = new ethers.Contract(claimsRewardAddress, claimsRewardABI, signer);

  console.log(`Running ${actionName}..`);

  await action({ cover, legacyPooledStaking, legacyClaimsReward, signer, opts });
}

module.exports = {
  runAction,
};
