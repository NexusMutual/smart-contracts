const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { PROVIDER_URL } = process.env;
const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';

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

const ROLE_MEMBER = 2;

async function getMemberStake(i, mr, tc) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

  if (!active) {
    return { member, amount: '0' };
  }

  const amount = await tc.tokensLocked(member, ethers.utils.formatBytes32String('CLA'));

  return { member, amount: amount.toString() };
}

async function main(provider) {
  const factory = await getContractFactory(provider);
  const tc = await factory('TC');
  const mr = await factory('MR');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const memberIds = [...Array(memberCount).keys()];
  const memberStakes = [];

  console.log('Fetching claim assessment stakes...');

  while (memberIds.length > 0) {
    const batch = memberIds.splice(0, 200);
    const stakes = await Promise.all(batch.map(i => getMemberStake(i, mr, tc)));
    memberStakes.push(...stakes);
    console.log(`Processed ${memberStakes.length}/${memberCount}`);
  }

  const nonZeroMemberStakes = memberStakes.filter(x => x.amount !== '0');

  fs.writeFileSync(
    path.join(__dirname, 'v2-migration/output/eligibleForCLAUnlock.json'),
    JSON.stringify(nonZeroMemberStakes, null, 2),
  );

  return nonZeroMemberStakes;
}

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  main(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
