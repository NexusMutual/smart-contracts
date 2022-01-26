require('dotenv').config();
const fs = require('fs');
const ethers = require('ethers');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

const { PROVIDER_URL } = process.env;

const EVENTS_START_BLOCK = 0;

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

function onlyUnique (value, index, self) {
  return self.indexOf(value) === index;
}

const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
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

  fs.appendFileSync('governance-rewardable.json', JSON.stringify(rewardable, null, 2), 'utf8');
};

main().catch(e => {
  console.log('Unhandled error encountered: ', e.stack);
  process.exit(1);
});
