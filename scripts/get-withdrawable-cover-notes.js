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

async function getWithdrawableCoverNotes(i, qt, mr) {
  const { 0: member, 1: active } = await mr.memberAtIndex(ROLE_MEMBER, i);

  if (!active) {
    return { member, withdrawableAmount: '0' };
  }

  const withdrawableAmount = await qt.getWithdrawableCoverNotesAmount(member);
  return {
    withdrawableAmount,
    member,
  };
}

async function main(provider, tc) {
  const factory = await getContractFactory(provider);
  tc = tc || (await factory('TC'));
  const mr = await factory('MR');
  const qt = await factory('QT');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const memberIds = [...Array(memberCount).keys()];
  const memberWithdrawalbeCoverNotes = [];

  console.log('Fetching claim assessment stakes...');

  while (memberIds.length > 0) {
    const batch = memberIds.splice(0, 200);
    const withdrawableCoverNotes = await Promise.all(
      batch.map(async i => {
        const withdrawableAmountWithMember = await getWithdrawableCoverNotes(i, qt, mr);
        return withdrawableAmountWithMember;
      }),
    );
    memberWithdrawalbeCoverNotes.push(...withdrawableCoverNotes);
    console.log(`Processed ${memberWithdrawalbeCoverNotes.length}/${memberCount}`);
  }

  const nonZeroMemberWithdrawableCoverNotes = memberWithdrawalbeCoverNotes.filter(x => x.withdrawableAmount !== '0');

  fs.writeFileSync(
    path.join(__dirname, 'v2-migration/output/eligible-for-cover-note-withdraw.json'),
    JSON.stringify(nonZeroMemberWithdrawableCoverNotes, null, 2),
  );

  return nonZeroMemberWithdrawableCoverNotes;
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
