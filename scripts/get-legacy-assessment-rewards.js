require('dotenv').config();

const fs = require('fs');
const ethers = require('ethers');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
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

const getTransferCalls = rewardable => {

  const transfers = Object.keys(rewardable)
    .map(address => `tk.transfer(${address}, ${rewardable[address]});`);

  const items = [
    '// REWARD_TRANSFERS_HELPER_BEGIN',
    ...transfers,
    '// REWARD_TRANSFERS_HELPER_END',
  ];

  return items.map(item => `    ${item}`).join('\n');
};

const main = async provider => {
  const factory = await getContractFactory(provider);
  const claimsData = await factory('CD');
  const claimRewards = await factory('CR');

  const contractPath = `${__dirname}/../contracts/modules/legacy/LegacyClaimsReward.sol`;
  const contract = fs.readFileSync(contractPath).toString();

  console.log('Collecting vote events');
  const filter = claimsData.filters.VoteCast();
  filter.fromBlock = EVENTS_START_BLOCK;

  const voteLogs = await provider.getLogs(filter);
  console.log(`Collected ${voteLogs.length} vote logs`);

  const addresses = voteLogs
    .map(log => {
      const data = claimsData.interface.parseLog(log);
      const { userAddress } = data.args;
      return userAddress;
    })
    .filter(onlyUnique);

  console.log('Fetching reward amounts');
  const rewards = await Promise.all(
    addresses.map(address => claimRewards.getRewardToBeDistributedByUser(address)),
  );
  console.log('Rewards fetched');

  const rewardable = addresses.map((address, i) => ({ address, reward: rewards[i].toString() }));
  const rewardablePath = `${__dirname}/rewardable.json`;
  fs.writeFileSync(rewardablePath, JSON.stringify(rewardable, null, 2), 'utf8');

  // Regex used to replace the transfer operations in LegacyClaimsReward.sol
  const templateHelperRegex = new RegExp(
    ' +// REWARD_TRANSFERS_HELPER_BEGIN.*// REWARD_TRANSFERS_HELPER_END',
  );

  const transferCalls = getTransferCalls(rewardable);
  const newContract = contract.replace(templateHelperRegex, transferCalls);

  fs.writeFileSync(contractPath, newContract);
};

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URL);
  main(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
