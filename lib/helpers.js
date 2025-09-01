import assert from 'assert';
import readline from 'readline';

export const toBytes = (string, size = 32) => {
  assert(string.length <= size, `String is too long to fit in ${size} bytes`);
  return '0x' + Buffer.from(string.padEnd(size, '\0')).toString('hex');
};

export const toBytes2 = s => toBytes(s, 2);
export const toBytes4 = s => toBytes(s, 4);
export const toBytes8 = s => toBytes(s, 8);
export const toBytes32 = s => toBytes(s, 32);

export const numberToBytes32 = n => '0x' + n.toString(16).padStart(64, '0');

export const hex = string => '0x' + Buffer.from(string).toString('hex');
export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const to = promise =>
  new Promise(resolve => {
    promise.then(r => resolve([r, null])).catch(e => resolve([null, e]));
  });

export const waitForInput = query => {
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

export const BigIntMath = {
  min: (a, b) => (a < b ? a : b),
  max: (a, b) => (a > b ? a : b),
};
