require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { setupLoader } = require('@openzeppelin/contract-loader');
const axios = require('axios');

const STAKER_MIGRATION_COMPLETED_EVENT = 'StakersMigrationCompleted';
const MIGRATED_MEMBER_EVENT = 'MigratedMember';
const MASTER_ADDRESS = '0x01bfd82675dbcc7762c84019ca518e701c0cd07e';
const GWEI_IN_WEI = 10e9;

function getenv (key, fallback = false) {

  const value = process.env[key] || fallback;

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

async function getGasPrice () {

  try {
    const response = await axios.get('https://www.etherchain.org/api/gasPriceOracle');
    if (!response.data.fast) {
      throw new Error(`Failed to extract 'fast' gas value.`);
    }
    return (parseInt(response.data.fast) * GWEI_IN_WEI).toString();
  } catch (e) {
    console.log(`Failed to get gas price from etherchain. ${e.stack} Using fallback with ethgasstation..`);
    const response = await axios.get('https://ethgasstation.info/json/ethgasAPI.json');
    if (!response.data.fast) {
      throw new Error(`Failed to extract 'fast' gas value.`);
    }
    return Math.floor((response.data.fast / 10) * GWEI_IN_WEI).toString();
  }
}

async function main () {

  const privateKey = getenv('MAINNET_MNEMONIC');
  const providerURL = getenv(`MAINNET_PROVIDER_URL`);
  const iterations = getenv(`ITERATIONS`, '10');

  const provider = new HDWalletProvider(privateKey, providerURL);
  const [address] = provider.getAddresses();
  console.log(`Using first address ${address} for sending transactions.`);

  const loader = setupLoader({
    provider,
    defaultSender: address,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  }).truffle;

  const gas = 5e6;

  let totalGasUsage = 0;
  let completed = false;
  let maxGasUsagePerCall = 0;
  let totalCallCount = 0;

  console.log(`Loading master at ${MASTER_ADDRESS}..`)
  const master = loader.fromArtifact('MasterMock', MASTER_ADDRESS);
  const psAddress = await master.getLatestAddress(hex('PS'));
  console.log(`Loading PooledStaking at ${psAddress}..`)
  const pooledStaking = loader.fromArtifact('PooledStaking', psAddress);
  while (!completed) {

    const gasPrice = await getGasPrice();

    if (gasPrice > 60 * GWEI_IN_WEI) {
      throw new Error(`Gas price too high: ${gasPrice.toString()}`);
    }

    const begin = Date.now();
    console.log({ gasEstimate: gas, gasPrice, iterations });
    const tx = await pooledStaking.migrateStakers(iterations, { gas, gasPrice });
    const end = Date.now();
    console.log(`Call took ${end - begin} milliseconds to complete.`);

    const [stakerMigrationCompleted] = tx.logs.filter(log => log.event === STAKER_MIGRATION_COMPLETED_EVENT);
    completed = stakerMigrationCompleted.args.completed;
    console.log(`Processing migration completed: ${completed}`);

    totalCallCount++;
    const gasUsed = tx.receipt.gasUsed;
    totalGasUsage += gasUsed;
    if (maxGasUsagePerCall < gasUsed) {
      maxGasUsagePerCall = gasUsed;
    }
    console.log(JSON.stringify({ gasUsed, totalGasUsage, maxGasUsagePerCall, totalCallCount }));

    const migratedMemberEvents = tx.logs.filter(log => log.event === MIGRATED_MEMBER_EVENT);
    for (const migratedMemberEvent of migratedMemberEvents) {
      const migratedMember = migratedMemberEvent.args.member;
      console.log(`Finished migrating: ${migratedMember}`);
    }
  }
}

main()
  .catch(error => {
    console.error(`Unhandled app error: ${error.stack}`);
    process.exit(1);
  });
