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


const allRelevantContracts = ["0xAFcE80b19A8cE13DEc0739a1aaB7A028d6845Eb3","0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F","0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f","0x3e532e6222afe9Bcf02DCB87216802c75D5113aE","0xb529964F86fbf99a6aA67f72a27e59fA3fa4FEaC","0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B","0xc1D2819CE78f3E15Ee69c6738eB1B400A26e632A","0x9D25057e62939D3408406975aD75Ffe834DA4cDd","0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd","0x02285AcaafEB533e03A7306C55EC031297df9224","0xD36132E0c1141B26E62733e018f12Eb38A7b7678","0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633","0x35D1b3F3D7966A1DFe207aa4514C12a259A0492B","0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27","0x11111254369792b2Ca5d084aB5eEA397cA8fa48B","0x86969d29F5fd327E1009bA66072BE22DB6017cC6","0x12f208476F64De6e6f933E55069Ba9596D818e08","0xe80d347DF1209a76DD9d2319d62912ba98C54DDD","0xB27F1DB0a7e473304A5a06E54bdf035F671400C0","0xB1dD690Cc9AF7BB1a906A9B5A94F94191cc553Ce","0x5B67871C3a857dE81A1ca0f9F7945e5670D986Dc","0x12D66f87A04A9E220743712cE6d9bB1B5616B8Fc","0x71CD6666064C3A1354a3B4dca5fA1E2D3ee7D303","0x34CfAC646f301356fAa8B21e94227e3583Fe3F5F","0x1E0447b19BB6EcFdAe1e4AE1694b0C3659614e4e","0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95","0x9AAb3f75489902f3a48495025729a0AF77d4b11e","0x6e95C8E8557AbC08b46F3c347bA06F8dC012763f","0x802275979B020F0ec871c5eC1db6e412b72fF20b","0x5d22045DAcEAB03B158031eCB7D9d06Fad24609b","0x364508A5cA0538d8119D3BF40A284635686C98c4","0x932773aE4B661029704e731722CF8129e1B32494","0x1F573D6Fb3F13d689FF844B4cE37794d79a7FF1C","0x519b70055af55A007110B4Ff99b0eA33071c720a","0x77208a6000691E440026bEd1b178EF4661D37426","0x5f9AE054C7F0489888B1ea46824b4B9618f8A711","0x2a0c0DBEcC7E4D658f48E01e3fA353F44050c208","0x0e2298E3B3390e3b945a5456fBf59eCc3f55DA16","0x241e82C79452F51fbfc89Fac6d912e021dB1a3B7","0x3fE7940616e5Bc47b0775a0dccf6237893353bB4","0x1fd169A4f5c59ACf79d0Fd5d91D1201EF1Bce9f1","0xAF350211414C5DC176421Ea05423F0cC494261fB"];


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


  if (argv[2] === 'pushRewards') {
    console.log(`Pushing accumulated rewards `);

    const FIXED_GAS_USED = 8e5;
    const gasPrice =  FIXED_GAS_PRICE; // await getGasPrice();
    await pooledStaking.pushRewards(allRelevantContracts, {
      gas: FIXED_GAS_USED,
      gasPrice
    });
    consol.log('Done');
    return;
  }

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
