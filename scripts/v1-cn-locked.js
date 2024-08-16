const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const deployments = require('@nexusmutual/deployments');

const { BigNumber } = ethers;

const OUTPUT_FILE = 'cla-locked-amount.json';
const ROLE_MEMBER = 2;

const getContractFactory = async providerOrSigner => {
  return async contractName => {
    const abi = deployments[contractName];
    const address = deployments.addresses[contractName];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

async function getMemberCN(member, mr, tc) {
  // const [member, active] = await mr.memberAtIndex(ROLE_MEMBER, memberId);

  // if (!active) {
  //   return { member, amount: '0' };
  // }

  const { coverIds, lockReasons, withdrawableAmount } = await tc.getWithdrawableCoverNotes(member);
  console.log({ coverIds, lockReasons, withdrawableAmount });
  const memberLockReasons = await tc.getLockReasons(member);
  console.log('memberLockReasons: ', memberLockReasons);

  const lockReasonIndexCover = {};
  let coverIndex = 0;
  for (const lockReason of lockReasons) {
    const lockReasonIndex = memberLockReasons.indexOf(lockReason);
    lockReasonIndexCover[lockReasonIndex] = BigNumber.from(coverIds[coverIndex++]).toString();
  }

  const sortedIndexes = Object.keys(lockReasonIndexCover).sort((a, b) => a - b);
  const sortedCoverIds = [];
  for (const index of sortedIndexes) {
    sortedCoverIds.push(lockReasonIndexCover[index]);
  }

  return {
    member,
    coverIds: sortedCoverIds,
    lockReasonIndexes: sortedIndexes,
    amount: withdrawableAmount.toString(),
  };
}

const main = async provider => {
  console.log('calling factory');
  const factory = await getContractFactory(provider);
  console.log('factory called');
  const tc = await factory('TokenController');
  const mr = await factory('MR');

  // const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  // const memberIds = [...Array(memberCount).keys()];
  const memberLockedCN = [];

  console.log('Fetching locked CN amounts for all members...');

  // while (memberIds.length > 0) {
    // const batch = memberIds.splice(0, 200);
    // console.log(`Processed a batch of 200 ${memberCount - memberIds.length}/${memberCount}`);

    // const lockedCN = await Promise.all(batch.map(memberId => getMemberCN(memberId, mr, tc)));
    const lockedCN = await getMemberCN('0x5D93f3c0e6134cDb10c2eb46ABC82353637C9983', mr, tc);
  console.log('lockedCN: ', lockedCN);

    for (const locked of lockedCN) {
      if (!memberLockedCN.some(x => x.member === locked.member) && locked.amount !== '0') {
        memberLockedCN.push(locked);
      }
    }
  // }

  console.log(`Found ${memberLockedCN.length} members with locked NXM for CN`);

  console.log(`Writing output to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(memberLockedCN, null, 2), 'utf8');
  console.log('Done.');
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
