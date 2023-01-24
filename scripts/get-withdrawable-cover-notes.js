const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const VERSION_DATA_URL = 'https://api.nexusmutual.io/version-data/data.json';
const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'eligible-for-cover-note-withdraw.json', // filename
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

const ROLE_MEMBER = 2;

async function getWithdrawableCoverNotes(i, qt, mr) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

  if (!active) {
    return { member, withdrawableAmount: '0' };
  }

  const withdrawableAmount = await qt.getWithdrawableCoverNotesAmount(member);
  return {
    withdrawableAmount: withdrawableAmount.toString(),
    member,
  };
}

async function main(provider, useCache = true) {
  // check the cache first
  if (useCache && fs.existsSync(OUTPUT_FILE)) {
    console.log('Using cached data for withdrawable cover notes');
    return JSON.parse(fs.readFileSync(OUTPUT_FILE).toString());
  }

  const factory = await getContractFactory(provider);
  const mr = await factory('MR');
  const qt = await factory('QT');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const memberIds = [...Array(memberCount).keys()];
  const memberWithdrawableCoverNotes = [];

  console.log('Fetching claim assessment stakes...');

  while (memberIds.length > 0) {
    const batch = memberIds.splice(0, 200);
    const withdrawableCoverNotes = await Promise.all(
      batch.map(async i => {
        const withdrawableAmountWithMember = await getWithdrawableCoverNotes(i, qt, mr);
        return withdrawableAmountWithMember;
      }),
    );
    memberWithdrawableCoverNotes.push(...withdrawableCoverNotes);
    console.log(`Processed ${memberWithdrawableCoverNotes.length}/${memberCount}`);
  }

  const nonZeroMemberWithdrawableCoverNotes = memberWithdrawableCoverNotes.filter(x => x.withdrawableAmount !== '0');

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(nonZeroMemberWithdrawableCoverNotes, null, 2));

  return nonZeroMemberWithdrawableCoverNotes;
}

if (require.main === module) {
  main(ethers.provider, false)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;