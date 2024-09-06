const { inspect } = require('node:util');
const fs = require('node:fs');

const { Sema } = require('async-sema');
const { ethers } = require('hardhat');

const { getContract } = require('./v1-nxm-push-utils');

const { BigNumber } = ethers;

const OUTPUT_FILE = 'v1-cn-locked-amount.json';
const ROLE_MEMBER = 2;

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

const main = async () => {
  const tc = getContract('TokenController');
  const mr = getContract('MemberRoles');

  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const membersSemaphore = new Sema(100, { capacity: memberCount });
  const memberLockedCN = [];
  const failedMemberIds = [];

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
        failedMemberIds.push(memberId);
      }
    } catch (e) {
      console.error(`\nError event for memberId ${memberId}: ${e.message}`);
      failedMemberIds.push(memberId);
    } finally {
      membersSemaphore.release();
    }
  });

  await Promise.all(memberPromises);

  console.log(`\nFound ${memberLockedCN.length} members with locked v1 NXM for CN`);
  console.log(`Failed members: ${inspect(failedMemberIds, { depth: null })}`);

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
