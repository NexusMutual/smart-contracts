require('dotenv').config();
const HDWalletProvider = require('@truffle/hdwallet-provider');
const { setupLoader } = require('@openzeppelin/contract-loader');
const axios = require('axios');

const REWARDS_MIGRATION_COMPLETED_EVENT = 'RewardsMigrationCompleted';
const MASTER_ADDRESS = '0x01bfd82675dbcc7762c84019ca518e701c0cd07e';
const GWEI_IN_WEI = 1e9;

function getenv (key, fallback = false) {

  const value = process.env[key] || fallback;

  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}


// UNUSED. here just in case
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
  const iterations = getenv(`ITERATIONS`, '200');

  const provider = new HDWalletProvider(privateKey, providerURL);
  const [address] = provider.getAddresses();
  console.log(`Using first address ${address} for sending transactions.`);

  // based on simulation no call exceeds 3 million
  const FIXED_GAS_ESTIMATE = 3e6; // 3 million
  /*

  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  TODO: adjust this according to the gas prices at the time
  !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

   */
  const FIXED_GAS_PRICE = 200e9; // 200 GWEI
  console.log({
    FIXED_GAS_ESTIMATE,
    FIXED_GAS_PRICE
  })

  const loader = setupLoader({
    provider,
    defaultSender: address,
    defaultGas: FIXED_GAS_ESTIMATE,
    defaultGasPrice: FIXED_GAS_PRICE,
  }).truffle;



  let totalGasUsage = 0;
  let finished = false;
  let maxGasUsagePerCall = 0;
  let totalCallCount = 0;

  console.log(`Loading master at ${MASTER_ADDRESS}..`)
  const master = loader.fromArtifact('MasterMock', MASTER_ADDRESS);
  const psAddress = await master.getLatestAddress(hex('PS'));
  console.log(`Loading PooledStaking at ${psAddress}..`)
  const pooledStaking = loader.fromArtifact('PooledStaking', psAddress);
  while (!finished) {

    console.log(` running migrateRewardsToAccumulatedRewards ..`);
    const gasPrice =  FIXED_GAS_PRICE; // await getGasPrice();

    const begin = Date.now();
    console.log({ gasEstimate: FIXED_GAS_ESTIMATE, gasPrice, iterations });
    const tx = await pooledStaking.migrateRewardsToAccumulatedRewards(iterations, { gas: FIXED_GAS_ESTIMATE, gasPrice });
    const end = Date.now();
    console.log(`Call took ${end - begin} milliseconds to complete.`);

    const [rewardsMigrationCompleted] = tx.logs.filter(log => log.event === REWARDS_MIGRATION_COMPLETED_EVENT);
    finished = rewardsMigrationCompleted.args.finished;
    console.log(`Processing migration completed: ${finished}`);

    totalCallCount++;
    const gasUsed = tx.receipt.gasUsed;
    totalGasUsage += gasUsed;
    if (maxGasUsagePerCall < gasUsed) {
      maxGasUsagePerCall = gasUsed;
    }
    console.log(JSON.stringify({ gasUsed, totalGasUsage, maxGasUsagePerCall, totalCallCount }));
  }
}

main()
  .catch(error => {
    console.error(`Unhandled app error: ${error.stack}`);
    process.exit(1);
  });
