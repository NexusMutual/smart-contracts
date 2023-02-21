const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'tc-locked-amount.json', // filename
);

const getContractFactory = async providerOrSigner => {
  const data = await fetch(VERSION_DATA_URL).then(r => r.json());
  const abis = data.mainnet.abis
    .map(item => ({ ...item, abi: JSON.parse(item.contractAbi) }))
    .reduce((data, item) => ({ ...data, [item.code]: item }), {});

  return async code => {
    const { abi, address } = abis[code];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

const ROLE_MEMBER = 2;

async function getLockedNXM(i, mr, tc, ps) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);
  if (!active) {
    return { member, amount: '0' };
  }

  const lockedAmount = await tc.totalLockedBalance(member); // includes PS deposits
  const psDeposit = await ps.stakerDeposit(member);
  const tokensLockedAmount = lockedAmount.sub(psDeposit);

  return { member, amount: tokensLockedAmount.toString() };
}

const main = async (provider, useCache = true) => {
  // check the cache first
  if (useCache && fs.existsSync(OUTPUT_FILE)) {
    console.log('Using cached data for TC locked amount');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }
  const factory = await getContractFactory(provider);
  const tc = await factory('TC');
  const mr = await factory('MR');
  const ps = await factory('PS');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const memberIds = [...Array(memberCount).keys()];
  const memberLockedNXM = {};

  console.log('Fetching locked amounts for all reasons for all members...');
  while (memberIds.length > 0) {
    const batch = memberIds.splice(0, 200);
    const lockedNXM = await Promise.all(batch.map(i => getLockedNXM(i, mr, tc, ps)));
    for (const locked of lockedNXM) {
      if (!lockedNXM[locked.member] && locked.amount !== '0') {
        memberLockedNXM[locked.member] = locked.amount;
      }
    }
    console.log(
      `Found ${
        Object.keys(memberLockedNXM).length
      } members with locked NXM in TC; processed a batch of 200/${memberCount}`,
    );
  }

  console.log('Writing output to output/tc-locked-amount.json...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(memberLockedNXM, null, 2), 'utf8');
  console.log('Done.');
};

if (require.main === module) {
  // use default provider and bypass cache when run via cli
  main(ethers.provider, false)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
