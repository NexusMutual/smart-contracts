const assert = require('assert');
const readline = require('readline');

const toBytes = (string, size = 32) => {
  assert(string.length <= size, `String is too long to fit in ${size} bytes`);
  return '0x' + Buffer.from(string.padEnd(size, '\0')).toString('hex');
};

const toBytes2 = s => toBytes(s, 2);
const toBytes4 = s => toBytes(s, 4);
const toBytes8 = s => toBytes(s, 8);
const toBytes32 = s => toBytes(s, 32);

const numberToBytes32 = n => '0x' + n.toString(16).padStart(64, '0');

const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const to = promise =>
  new Promise(resolve => {
    promise.then(r => resolve([r, null])).catch(e => resolve([null, e]));
  });

const read = async query => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, resolve));
};

const waitForInput = query => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close();
      resolve(ans);
    }),
  );
};

const BigIntMath = {
  min: (a, b) => {
    const aBigInt = BigInt(a);
    const bBigInt = BigInt(b);
    return aBigInt < bBigInt ? aBigInt : bBigInt;
  },
  max: (a, b) => {
    const aBigInt = BigInt(a);
    const bBigInt = BigInt(b);
    return aBigInt > bBigInt ? aBigInt : bBigInt;
  },
  divCeil: (a, b) => (BigInt(a) + BigInt(b) - 1n) / BigInt(b),
  sum: arr => arr.reduce((x, y) => BigInt(x) + BigInt(y), 0n),
  /**
   * Round up to the nearest multiple of a given unit
   * Example: roundUpToMultiple(7n, 3n) = 9n
   */
  roundUpToMultiple: (value, unit) => BigIntMath.divCeil(value, unit) * BigInt(unit),
};

module.exports = {
  BigIntMath,
  hex,
  numberToBytes32,
  read,
  sleep,
  to,
  toBytes,
  toBytes2,
  toBytes32,
  toBytes4,
  toBytes8,
  waitForInput,
};
