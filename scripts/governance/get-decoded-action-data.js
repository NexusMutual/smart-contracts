const util = require('node:util');
const { ethers } = require('hardhat');

const { PROPOSAL_CATEGORY } = require('./constants');
const { defaultAbiCoder, toUtf8String } = ethers.utils;

// Prefixed and non-prefixed hex are both valid
const HEX_REGEX = /^(?:0x)?[a-f0-9]+$/i;

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
      opts.categoryId = argsArray.shift();
      if (!PROPOSAL_CATEGORY[opts.categoryId]) {
        const supportedCategories = Object.keys(PROPOSAL_CATEGORY).join(', ');
        throw new Error(`Category ${opts.categoryId} not yet supported. Supported categories: ${supportedCategories}`);
      }
      continue;
    }

    if (['--data', '-d'].includes(arg)) {
      const hexData = argsArray.shift();
      if (!hexData.match(HEX_REGEX)) {
        throw new Error('Invalid hex data');
      }
      // Add '0x' prefix if its missing
      opts.data = opts.data.startsWith('0x') ? hexData : '0x' + hexData;
    }
  }

  if (!opts.categoryId) {
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

  decodeParamData(opts);
}

/**
 * Function to decode action parameters from a governance proposal
 * @param {Object} options - options object containing categoryId and data
 * @returns an array of processed values, converting bytes to UTF8 where applicable
 */
function decodeParamData(options) {
  const actionParamTypes = PROPOSAL_CATEGORY[options.categoryId].actionParamTypes;

  const decodedValues = defaultAbiCoder.decode(actionParamTypes, options.data);

  // NOTE: we're assuming here that bytes needs to be converted to UTF8
  const processedValues = decodedValues.map((value, index) => {
    const paramType = actionParamTypes[index];

    // Handle bytes[] array
    if (paramType.startsWith('bytes') && paramType.endsWith('[]')) {
      return value.map(bytes => toUtf8String(bytes));
    }
    // Handle single bytes
    if (paramType.startsWith('bytes')) {
      return toUtf8String(value);
    }

    return value;
  });

  console.log(`Decoded ${options.categoryId}:\n${util.inspect(processedValues, { depth: 2 })}`);

  return processedValues;
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
  decodeParamData,
};
