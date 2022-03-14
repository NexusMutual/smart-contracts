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

const getTransferCalls = rewardable => `// {REWARD_TRANSFERS_HELPER_BEGIN}
${Object.keys(rewardable)
  .map(address => {
    return `    tk.transfer(${address}, ${rewardable[address]});`;
  })
  .join('\n')}
    // {REWARD_TRANSFERS_HELPER_END}`;

const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const factory = await getContractFactory(provider);
  const claimsData = await factory('CD');
  const claimRewards = await factory('CR');

  const filter = claimsData.filters.VoteCast();
  filter.fromBlock = EVENTS_START_BLOCK;
  const voteLogs = await provider.getLogs(filter);

  const addresses = voteLogs
    .map(log => {
      const data = claimsData.interface.parseLog(log);
      const { userAddress } = data.args;
      return userAddress;
    })
    .filter(onlyUnique);

  const rewards = await Promise.all(addresses.map(address => claimRewards.getRewardToBeDistributedByUser(address)));

  const rewardable = addresses.reduce((acc, address, index) => {
    if (rewards[index].isZero()) {
      return acc;
    }
    acc[address] = rewards[index].toString();
    return acc;
  }, {});

  const contract = fs.readFileSync('./contracts/modules/claims/LegacyClaimsReward.sol');

  fs.writeFileSync('rewardable.json', JSON.stringify(rewardable, null, 2), 'utf8');

  // Regex used to replace the transfer operations in LegacyClaimsReward.sol
  const templateHelperRegex = /\/\/ \{REWARD_TRANSFERS_HELPER_BEGIN\}([\s\S]*?)\/\/ \{REWARD_TRANSFERS_HELPER_END\}/;
  const newContract = contract.toString().replace(templateHelperRegex, getTransferCalls(rewardable));
  fs.writeFileSync('./contracts/modules/claims/LegacyClaimsReward.sol', newContract);
};

if (!module.parent) {
  main().catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = { main };
