const workerpool = require('workerpool');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');
const { toChecksumAddress } = require('ethereumjs-util');

const Position = {
  start: 'start',
  end: 'end',
  any: 'any',
};

const worker = (config, batchNumber, size) => {
  const from = batchNumber * size;
  const to = from + size;
  const results = [];

  for (let salt = from; salt < to; salt++) {
    // assemble input
    const saltHex = salt.toString(16).padStart(64, '0');
    const input = hexToBytes(`ff${config.factory}${saltHex}${config.bytecodeHash}`);
    const create2Hash = keccak256(input);
    const address = bytesToHex(create2Hash.slice(32 - 20));
    const checksumedAddress = toChecksumAddress(`0x${address}`);

    const output = config.ignoreCase ? address.toLowerCase() : checksumedAddress.slice(2);

    if (
      (config.position === Position.start && output.startsWith(config.search)) ||
      (config.position === Position.end && output.endsWith(config.search)) ||
      (config.position === Position.any && output.includes(config.search))
    ) {
      results.push({ salt, address: checksumedAddress });
    }
  }

  return results;
};

workerpool.worker({ worker });
