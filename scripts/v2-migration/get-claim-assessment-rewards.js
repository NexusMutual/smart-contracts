require('dotenv').config();

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { ethers, config } = require('hardhat');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const EVENTS_START_BLOCK = 0;
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'claim-assessment-rewards.json', // filename
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

const getTransferCalls = rewardables => {
  const transfers = rewardables.map(rewardable => `tk.transfer(${rewardable.address}, ${rewardable.reward});`);
  const items = ['// REWARD_TRANSFERS_HELPER_BEGIN', ...transfers, '// REWARD_TRANSFERS_HELPER_END'];

  return items.map(item => `    ${item}`).join('\n');
};

const main = async (provider, useCache = true) => {
  // check the cache first
  if (useCache && fs.existsSync(OUTPUT_FILE)) {
    console.log('Using cached data for Claim Assessment rewards');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }

  const factory = await getContractFactory(provider);
  const claimsData = await factory('CD');
  const claimRewards = await factory('CR');

  const contractPath = path.join(__dirname, '../../contracts/modules/legacy/LegacyClaimsReward.sol');
  const contract = fs.readFileSync(contractPath).toString();

  console.log('Fetching all vote events...');
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
  console.log(`Found ${addresses.length} unique addresses`);

  console.log('Fetching getRewardToBeDistributedByUser() for all addressess...');
  const rewards = await Promise.all(addresses.map(address => claimRewards.getRewardToBeDistributedByUser(address)));
  console.log('Rewards fetched');

  const rewardable = addresses
    .map((address, i) => ({ address, reward: rewards[i].toString() }))
    .filter(rewardable => rewardable.reward !== '0');

  console.log(rewardable);
  console.log(`Found ${Object.keys(rewardable).length} unique addresses with rewards`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(rewardable, null, 2), 'utf8');

  // Regex used to replace the transfer operations in LegacyClaimsReward.sol
  const templateHelperRegex = / +\/\/ REWARD_TRANSFERS_HELPER_BEGIN.*\/\/ REWARD_TRANSFERS_HELPER_END/s;
  const transferCalls = getTransferCalls(rewardable);
  const newContract = contract.replace(templateHelperRegex, transferCalls);

  console.log(`Write new contract to path ${contractPath}`);
  fs.writeFileSync(contractPath, newContract);
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
