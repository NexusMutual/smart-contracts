const assert = require('assert');
const readline = require('readline');
const { BigNumber } = require('ethers');

const toBytes = (string, size = 32) => {
  assert(string.length <= size, `String is too long to fit in ${size} bytes`);
  return '0x' + Buffer.from(string.padEnd(size, '\0')).toString('hex');
};

const toBytes2 = s => toBytes(s, 2);
const toBytes4 = s => toBytes(s, 4);
const toBytes8 = s => toBytes(s, 8);

const hex = string => '0x' + Buffer.from(string).toString('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const filterArgsKeys = args => {
  const params = {};
  for (const key of Object.keys(args)) {
    if (isNaN(key) && key !== '__length__') {
      const value = args[key];
      params[key] = BigNumber.isBigNumber(value) ? value.toString() : value;
    }
  }
  return params;
};

const to = promise =>
  new Promise(resolve => {
    promise.then(r => resolve([r, null])).catch(e => resolve([null, e]));
  });

function waitForInput(query) {
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
}

const daysToSeconds = days => days * 24 * 60 * 60;
const hoursToSeconds = hours => hours * 60 * 60;

// hideous function used as a temporary workaround to flip the
// order of the params for proposal categories
// the input is an item from ./proposal-categories.js
// the output can be fed to ProposalCategory.addCategory() function
const categoryParamsToValues = category => {
  const [
    name,
    memberRoleToVote,
    majorityVotePerc,
    quorumPerc,
    categoryABReq,
    actionIpfsHash,
    contractName,
    fnSignature,
    allowedToCreateProposal = [2],
  ] = category;
  return [
    name,
    memberRoleToVote,
    majorityVotePerc,
    quorumPerc,
    allowedToCreateProposal,
    300, // closing time, 259200 on mainnet (3 days)
    actionIpfsHash,
    '0x' + '0'.repeat(40), // zero address
    hex(contractName),
    [0, 0, categoryABReq, /* isSpecialResolution: */ quorumPerc === 0 ? 1 : 0],
    fnSignature,
  ];
};

module.exports = {
  filterArgsKeys,
  hex,
  toBytes,
  toBytes2,
  toBytes4,
  toBytes8,
  sleep,
  to,
  waitForInput,
  daysToSeconds,
  hoursToSeconds,
  categoryParamsToValues,
};
