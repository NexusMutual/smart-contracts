const util = require('node:util');
const { ethers } = require('hardhat');

const { defaultAbiCoder, toUtf8String } = ethers.utils;

const HEX_REGEX = /^0x[a-f0-9]+$/i;
const CATEGORIES_HANDLERS = {
  29: decodeReleaseNewContractCode,
};

const usage = () => {
  console.log(`
    Usage:
      get-decoded-action-data [OPTION]

    Options:
      --category-id, -i CATEGORY_ID
        The category id of the governance proposal.
      --data, -d HEX_ACTION_DATA
        The action data to decode in hex format
      --help, -h
        Print this help message.
  `);
};

const parseArgs = async args => {
  const opts = {};

  const argsArray = args.slice(2);

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

    if (['--category-id', '-i'].includes(arg)) {
      opts.category = argsArray.shift();
      if (!CATEGORIES_HANDLERS[opts.category]) {
        const supportedCategories = Object.keys(CATEGORIES_HANDLERS).join(', ');
        throw new Error(`Category ${opts.category} not yet supported. Supported categories: ${supportedCategories}`);
      }
      continue;
    }

    if (['--data', '-d'].includes(arg)) {
      const hexData = argsArray.shift();
      if (!hexData.match(HEX_REGEX)) {
        throw new Error('Invalid hex data');
      }
      opts.data = hexData;
    }
  }

  if (!opts.category) {
    throw new Error('Missing required argument: --category-id');
  }

  if (!opts.data) {
    throw new Error('Missing required argument: --data, -d');
  }

  return opts;
};

async function main() {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  CATEGORIES_HANDLERS[opts.category](opts);
}

/* Category Handlers */

function decodeReleaseNewContractCode(options) {
  const [codes, addresses] = defaultAbiCoder.decode(['bytes2[]', 'address[]'], options.data);
  const contractCodesUtf8 = codes.map(code => toUtf8String(code));

  console.log(`Decoded Release New Contract Code (29):\n${util.inspect([contractCodesUtf8, addresses], { depth: 2 })}`);
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = {
  decodeReleaseNewContractCode,
};
