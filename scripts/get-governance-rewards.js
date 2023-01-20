const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const EVENTS_START_BLOCK = 0;
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'governance-rewardable.json', // filename
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
    console.log('Using cached data for goverance rewards');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }

  const factory = await getContractFactory(provider);
  const governance = await factory('GV');

  const filter = governance.filters.Vote();
  filter.fromBlock = EVENTS_START_BLOCK;
  const voteLogs = await provider.getLogs(filter);

  const addresses = voteLogs
    .map(log => {
      const data = governance.interface.parseLog(log);
      const { from } = data.args;
      return from;
    })
    .filter(onlyUnique);

  console.log(`Fetched ${addresses.length} addresses.`);

  console.log(`Fetching getPendingReward for each..`);
  const rewards = await Promise.all(addresses.map(address => governance.getPendingReward(address)));

  const rewardable = addresses.reduce((acc, address, index) => {
    if (rewards[index].isZero()) {
      return acc;
    }
    acc[address] = rewards[index].toString();
    return acc;
  }, {});

  console.log(rewardable);
  console.log(Object.keys(rewardable).length);

  fs.appendFileSync(OUTPUT_FILE, JSON.stringify(rewardable, null, 2), 'utf8');
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
