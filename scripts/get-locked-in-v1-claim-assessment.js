const { ethers } = require('hardhat');
const fs = require('fs');
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

async function checkMember (i, mr, tc) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

  if (!active) {
    return { member, amount: '0' };
  }

  const amount = await tc.tokensLocked(member, ethers.utils.formatBytes32String('CLA'));

  if (amount.eq(ethers.constants.Zero)) {
    return { member, amount: '0' };
  }
  return { member, amount: amount.toString() };
}

async function main () {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const factory = await getContractFactory(provider);
  const tc = await factory('TC');
  const mr = await factory('MR');

  const memberCount = await mr.membersLength(ROLE_MEMBER);

  const promises = Promise.all(new Array(memberCount.toNumber()).fill('').map((_, i) => checkMember(i, mr, tc)));
  const amounts = await promises;
  const eligibleForUnlock = amounts.filter(x => x.amount != '0');
  fs.writeFileSync('./deploy/eligibleForCLAUnlock.json', JSON.stringify(eligibleForUnlock, null, 2));
  return eligibleForUnlock;
}

if (!module.parent) {
  main().catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}
