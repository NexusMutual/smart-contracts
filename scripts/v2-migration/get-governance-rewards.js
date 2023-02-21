const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const EVENTS_START_BLOCK = 0;
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'governance-rewards.json', // filename
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

function onlyUnique(value, index, self) {
  return self.indexOf(value) === index;
}

const main = async (provider, useCache = true) => {
  // check the cache first
  if (useCache && fs.existsSync(OUTPUT_FILE)) {
    console.log('Using cached data for Governance rewards');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }

  const factory = await getContractFactory(provider);
  const governance = await factory('GV');

  console.log(`Fetching all vote events to extract addresses...`);
  const filter = governance.filters.Vote();
  filter.fromBlock = EVENTS_START_BLOCK;
  const voteLogs = await provider.getLogs(filter);
  const addresses = voteLogs
    .map(log => {
      const data = governance.interface.parseLog(log);
      const { from } = data.args;
      return from.toLowerCase();
    })
    .filter(onlyUnique);

  // Computed using Dune: https://dune.com/queries/2012946
  const ADDRESSES_WITH_DELEGATIONS = [
    '0x0baf7b79f9174c0840aa93a93a2c2a81044a09a2',
    '0x0e7af95de26bf10e6b9f00d846c22757aa582b9c',
    '0x0fb773f852d58b0af2723e4efc29500c35e5e710',
    '0x1ca4c34b18ecf1df4ba7e2ae0ec1fc5960c349d9',
    '0x1edd1f0d625eb38387bdbbe074994a87fd4959d2',
    '0x2079c29be9c8095042edb95f293b5b510203d6ce',
    '0x2ce54b5ca6ff6817269ce9a4ae7a4c4dbaa01937',
    '0x2ed65eb5888cd73d74b9c847ffe4b801ee818720',
    '0x30ad57a20f7af14f542d0d253228e2228aaff1cc',
    '0x3ead00d7e1b95c5e99f287f04c72f62f2cb67c80',
    '0x50b1799782dfdc5f0aabd4b6719902d8955596bd',
    '0x52214e671e0a36e4bd8196e2933df2a71aa06377',
    '0x528b8795f9e1676e809633f7ba5fd3e8548e2235',
    '0x5af7c307c716932b74577d6f9599fe871c388a91',
    '0x635762560cf0f5625225eebd6358a297377f6509',
    '0x63c5229302d4b93241aa06b08447b5c13edd3abf',
    '0x6c11c151adc437db6b95968997ab8caa0d7188d0',
    '0x6e8fb0a6e06295ebc9b25b78f40eba5214ce1beb',
    '0x9094aac930c0ab554ec63de19ac3802cba6418db',
    '0x96ada25518aaac06c412143a57cca5c5af17ec0d',
    '0x9a55ae98dc059b88458dfdb0014857bcc4178e22',
    '0xa033817b572976f09b556deb922f3103a2fb760e',
    '0xa216208dab8aeba66080129db856f4a84f0f809a',
    '0xa5eacbdbbbbb1df3ff1df90082f176eb55647ec0',
    '0xa614869e9b3deec7c04383062479d9403fe6ba17',
    '0xa6b4ec504a17217146008eb8121b1a072cdb8f11',
    '0xc9c1a3b1c722bf90f786251e0f25e7bbd6b3f149',
    '0xfeb60bdccdeab4ad217fdf8f252e61b68efb1538',
    '0xff16d64179a02d6a56a1183a28f1d6293646e2dd',
  ].map(address => address.toLowerCase());

  console.log(`Found ${addresses.length} unique addresses from the event`);
  console.log(`Adding ${ADDRESSES_WITH_DELEGATIONS.length} unique addresses with delegations`);

  addresses.push(...ADDRESSES_WITH_DELEGATIONS);

  const uniqueAddresses = [...new Set(addresses)];
  console.log(`Found ${uniqueAddresses.length} total unique addresses (after deduping)`);

  console.log(`Fetching getPendingReward() for all addresses..`);
  const rewards = await Promise.all(addresses.map(address => governance.getPendingReward(address)));

  console.log(`Filtering out addresses with 0 rewards..`);
  const rewardable = addresses.reduce((acc, address, index) => {
    if (rewards[index].isZero()) {
      return acc;
    }
    acc[address] = rewards[index].toString();
    return acc;
  }, {});

  console.log(rewardable);
  console.log(`Found ${Object.keys(rewardable).length} unique addresses with rewards`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rewardable, null, 2), 'utf8');
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
