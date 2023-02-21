const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'claim-assessment-stakes.json', // filename
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

async function getMemberStake(i, mr, tc) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);
  if (!active) {
    return { member, amount: '0' };
  }

  const tokensLockedAmount = await tc.tokensLocked(member, ethers.utils.formatBytes32String('CLA'));
  return { member, amount: tokensLockedAmount.toString() };
}

const main = async (provider, useCache = true) => {
  // check the cache first
  if (useCache && fs.existsSync(OUTPUT_FILE)) {
    console.log('Using cached data for Claim Assessment Stakes');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }

  const factory = await getContractFactory(provider);
  const tc = await factory('TC');
  const mr = await factory('MR');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const memberIds = [...Array(memberCount).keys()];
  const memberStakes = {};

  console.log('Fetching claim assessment stakes...');

  while (memberIds.length > 0) {
    const batch = memberIds.splice(0, 200);
    const stakes = await Promise.all(batch.map(i => getMemberStake(i, mr, tc)));
    for (const stake of stakes) {
      if (!memberStakes[stake.member] && stake.amount !== '0') {
        memberStakes[stake.member] = stake.amount;
      }
    }
    console.log(
      `Found ${Object.keys(memberStakes).length} non-zero stakes when processing 200/${memberCount} members...`,
    );
  }

  console.log(`Found ${Object.keys(memberStakes).length} total members with non-zero CLA stakes.`);
  console.log(memberStakes);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(memberStakes, null, 2));

  return memberStakes;
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
