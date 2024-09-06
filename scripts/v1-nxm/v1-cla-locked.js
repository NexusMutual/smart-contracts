const { inspect } = require('node:util');
const fs = require('node:fs');

const { Sema } = require('async-sema');
const { ethers } = require('hardhat');

const { getContract } = require('./v1-nxm-push-utils');

const OUTPUT_FILE = 'v1-cla-locked-amount.json';
const ROLE_MEMBER = 2;

async function getMemberCLA(memberId, claReason, mr, tc) {
  process.stdout.write(`\rProcessing memberId ${memberId}`);

  const [member, active] = await mr.memberAtIndex(ROLE_MEMBER, memberId);

  if (!active) {
    return { member, amount: '0' };
  }

  const amount = await tc.tokensLocked(member, claReason);

  return { member, amount: amount.toString() };
}

const main = async () => {
  const v1ClaimAssessment = [];

  const mr = getContract('MemberRoles');
  const tc = getContract('TokenController');

  const claReason = ethers.utils.formatBytes32String('CLA');
  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const membersSemaphore = new Sema(100, { capacity: memberCount });

  console.log('Fetching V1 Pooled Staking stake / rewards for all members...');
  const failedMemberIds = [];

  const memberPromises = Array.from({ length: memberCount }).map(async (_, memberId) => {
    await membersSemaphore.acquire();

    try {
      const result = await getMemberCLA(memberId, claReason, mr, tc);
      if (result.amount !== '0') {
        v1ClaimAssessment.push(result);
      }
    } catch (e) {
      console.error(`Error processing memberId ${memberId}: ${e.message}`);
      failedMemberIds.push(memberId);
    }

    membersSemaphore.release();
  });

  await Promise.all(memberPromises);

  console.log(`Found ${v1ClaimAssessment.length} members with locked v1 NXM for CLA`);
  console.log(`Failed members: ${inspect(failedMemberIds, { depth: null })}`);

  console.log(`Writing output to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(v1ClaimAssessment, null, 2), 'utf8');
  console.log('Done.');
};

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}
