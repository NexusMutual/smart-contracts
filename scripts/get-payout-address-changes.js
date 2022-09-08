const { ethers } = require('hardhat');
const fetch = require('node-fetch');

const { PROVIDER_URL } = process.env;
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

const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const factory = await getContractFactory(provider);
  const memberRoles = await factory('MR');

  const filter = memberRoles.filters.ClaimPayoutAddressSet();
  filter.fromBlock = EVENTS_START_BLOCK;
  const voteLogs = await provider.getLogs(filter);

  const addresses = voteLogs
    .map(log => {
      const data = memberRoles.interface.parseLog(log);
      const { member, payoutAddress } = data.args;
      return { member, payoutAddress };
    })
    .filter(x => x.payoutAddress !== ethers.constants.AddressZero);

  console.log(addresses);
};

main().catch(e => {
  console.log('Unhandled error encountered: ', e.stack);
  process.exit(1);
});
