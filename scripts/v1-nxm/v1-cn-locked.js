require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const { Sema } = require('async-sema');
const deployments = require('@nexusmutual/deployments');

const { BigNumber } = ethers;

const OUTPUT_FILE = 'cn-locked-amount.json';
const ROLE_MEMBER = 2;

const getContractFactory = async providerOrSigner => {
  return async contractName => {
    const abi = deployments[contractName];
    const address = deployments.addresses[contractName];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

async function getMemberCN(memberId, mr, tc) {
  try {
    const [member, active] = await mr.memberAtIndex(ROLE_MEMBER, memberId);

    if (!active) {
      return { member, amount: '0' };
    }

    const { coverIds, lockReasons, withdrawableAmount } = await tc.getWithdrawableCoverNotes(member);
    const memberLockReasons = await tc.getLockReasons(member);

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
  } catch (error) {
    console.error(`Error processing memberId ${memberId}: ${error.message}`);
    return { member: 'unknown', amount: '0', error: error.message };
  }
}

const main = async provider => {
  const factory = await getContractFactory(provider);
  const tc = await factory('TokenController');
  const mr = await factory('MemberRoles');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const membersSemaphore = new Sema(100, { capacity: memberCount });
  const memberLockedCN = [];

  console.log('Fetching locked CN amounts for all members...');

  const memberPromises = Array.from({ length: memberCount }).map(async (_, memberId) => {
    await membersSemaphore.acquire();

    try {
      process.stdout.write(`\rProcessing memberId ${memberId}`);
      const lockedCN = await getMemberCN(memberId, mr, tc);
      
      if (lockedCN.amount !== '0') {
        memberLockedCN.push(lockedCN);
      }
      if (lockedCN.error) {
        console.error(`\nError event for memberId ${memberId}: ${lockedCN.error}`);
      }
    } finally {
      membersSemaphore.release();
    }
  });

  await Promise.all(memberPromises);

  console.log(`\nFound ${memberLockedCN.length} members with locked NXM for CN`);

  console.log(`Writing output to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(memberLockedCN, null, 2), 'utf8');
  console.log('Done.');
};

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
  main(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
