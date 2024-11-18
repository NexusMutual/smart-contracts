const { ethers } = require('hardhat');
const { PROPOSAL_CATEGORY } = require('./constants');

const { defaultAbiCoder, toUtf8Bytes } = ethers.utils;
const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;

const usage = () => {
  console.log(`
    Usage:
      get-encoded-action-data [OPTION]

    Options:
      --category-id, -i CATEGORY_ID
        The category id of the governance proposal.
      --actionParams, -a ARGS
        JSON array of action parameters in the order specified by the category types:
        
        ${Object.entries(PROPOSAL_CATEGORY)
          .map(
            ([id, { description, actionParamTypes }]) =>
              `Category ${id} (${description}): ${JSON.stringify(actionParamTypes)}`,
          )
          .join('\n        ')}

      --help, -h
        Print this help message.
  `);
};

const isValidJSON = str => {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
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
      const categoryId = argsArray.shift();
      if (!PROPOSAL_CATEGORY[categoryId]) {
        const supportedCategories = Object.keys(PROPOSAL_CATEGORY).join(', ');
        throw new Error(`Category ${categoryId} not yet supported. Supported categories: ${supportedCategories}`);
      }
      opts.categoryId = categoryId;
      continue;
    }

    if (['--actionParams', '-a'].includes(arg)) {
      const argsString = argsArray.shift();
      if (!isValidJSON(argsString)) {
        throw new Error('-a ARGS must be in JSON format');
      }
      const actionParams = JSON.parse(argsString);
      opts.actionParams = actionParams;
    }
  }

  if (!opts.categoryId) {
    throw new Error('Missing required argument: --category-id, -i');
  }

  const { actionParamTypes, description } = PROPOSAL_CATEGORY[opts.categoryId];
  const expectedArgsLength = actionParamTypes.length;
  if (!opts.actionParams || opts.actionParams.length !== expectedArgsLength) {
    const errorMessage =
      `Invalid number of arguments for category ${opts.categoryId} (${description}). ` +
      `Expected ${expectedArgsLength} params (${actionParamTypes.join(', ')}), got ${opts.actionParams?.length || 0}`;
    throw new Error(errorMessage);
  }

  return opts;
};

/**
 * Converts UTF-8 contract codes to bytes in hex format
 */
const getContractCodeHexBytes = code => `0x${Buffer.from(toUtf8Bytes(code)).toString('hex')}`;

function validateAddress(address, index) {
  if (!address.match(ADDRESS_REGEX)) {
    throw new Error(`Invalid address format at index ${index}: ${address}`);
  }
}

/**
 * @dev Update this function to handle new types accordingly
 */
function processArg(arg, type, argsIndex) {
  // Handle array types
  if (type.endsWith('[]')) {
    if (!Array.isArray(arg)) {
      throw new Error(`Argument ${argsIndex} should be an array for type ${type}`);
    }

    // Validate array of addresses
    if (type === 'address[]') {
      arg.forEach((addr, arrayIndex) => {
        validateAddress(addr, `${argsIndex}[${arrayIndex}]`);
      });
      return arg;
    }

    // Convert string array to bytes
    if (type.includes('bytes')) {
      return arg.map(getContractCodeHexBytes);
    }
    return arg;
  }

  if (type === 'address') {
    validateAddress(arg, argsIndex);
    return arg;
  }

  // Convert string to bytes
  if (type.includes('bytes')) {
    return getContractCodeHexBytes(arg);
  }

  return arg;
}

function getEncodedAction(categoryId, actionParams) {
  const { actionParamTypes, description } = PROPOSAL_CATEGORY[categoryId];

  if (actionParams.length !== actionParamTypes.length) {
    const errorMessage =
      'Invalid number of arguments. ' +
      `Expected ${actionParamTypes.length} arguments for category ${categoryId}, got ${actionParams.length}`;
    throw new Error(errorMessage);
  }

  const processedArgs = actionParams.map((arg, index) => processArg(arg, actionParamTypes[index], index));

  const encodedAction = defaultAbiCoder.encode(actionParamTypes, processedArgs);
  console.log(`Encoded ${description} (${categoryId}):\n${encodedAction}`);

  return encodedAction;
}

async function main() {
  const opts = await parseArgs(process.argv).catch(err => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });

  getEncodedAction(opts.categoryId, opts.actionParams);
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
  getEncodedAction,
};
