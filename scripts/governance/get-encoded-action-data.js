const { ethers } = require('hardhat');

const { AbiCoder, toUtf8Bytes } = ethers;

const ADDRESS_REGEX = /^0x[a-f0-9]{40}$/i;
const CATEGORIES_HANDLERS = {
  29: encodeReleaseNewContractCode,
};

const usage = () => {
  console.log(`
    Usage:
      get-encoded-action-data [OPTION]

    Options:
      --category-id, -i CATEGORY_ID
        The category id of the governance proposal.
      --contract-codes, -c CONTRACT_CODES
        An array of utf-8 contract codes in JSON format.
      --addresses, -a ADDRESSES
        An array of addresses corresponding the contract does in JSON format.
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
      opts.category = argsArray.shift();
      if (!CATEGORIES_HANDLERS[opts.category]) {
        const supportedCategories = Object.keys(CATEGORIES_HANDLERS).join(', ');
        throw new Error(`Category ${opts.category} not yet supported. Supported categories: ${supportedCategories}`);
      }
      continue;
    }

    if (['--contract-codes', '-c'].includes(arg)) {
      const contractCodesString = argsArray.shift();

      if (!isValidJSON(contractCodesString)) {
        throw new Error('-c CONTRACT_CODES must be in JSON format');
      }

      const contractCodes = JSON.parse(contractCodesString);
      contractCodes.forEach(code => {
        if (code.length !== 2) {
          throw new Error(`Invalid contract code ${code}`);
        }
      });

      opts.contractCodes = contractCodes;
    }

    if (['--addresses', '-a'].includes(arg)) {
      const addressesString = argsArray.shift();
      if (!isValidJSON(addressesString)) {
        throw new Error('-a ADDRESSES must be in JSON format');
      }
      const addresses = JSON.parse(addressesString);
      addresses.forEach(address => {
        if (!address.match(ADDRESS_REGEX)) {
          throw new Error(`Invalid address ${address}`);
        }
      });
      opts.addresses = addresses;
    }
  }

  if (!opts.category) {
    throw new Error('Missing required argument: --category-id, -c');
  }

  if (opts.category === '29') {
    if (!opts.contractCodes || !opts.addresses) {
      throw new Error('Contract codes and addresses are required for category 29');
    }
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

/**
 * Converts UTF-8 contract codes to bytes in hex format
 */
const getContractCodeHexBytes = code => `0x${Buffer.from(toUtf8Bytes(code)).toString('hex')}`;

/* Category Handlers */

function encodeReleaseNewContractCode(options) {
  const contractCodeBytes = options.contractCodes.map(getContractCodeHexBytes);
  const abiCoder = new AbiCoder();
  const decodedAction = abiCoder.encode(['bytes2[]', 'address[]'], [contractCodeBytes, options.addresses]);
  console.log(`Encoded Release New Contract Code (29):\n${decodedAction}`);
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
  getContractCodeHexBytes,
  encodeReleaseNewContractCode,
};
