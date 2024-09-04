require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const { Sema } = require('async-sema');
const deployments = require('@nexusmutual/deployments');

const OUTPUT_FILE = 'cla-locked-amount.json';
const ROLE_MEMBER = 2;

const getContractFactory = async providerOrSigner => {
  return async contractName => {
    const abi = deployments[contractName];
    const address = deployments.addresses[contractName];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

async function getMemberCLA(memberId, claReason, mr, tc) {
  process.stdout.write(`\rProcessing memberId ${memberId}`);

  const [member, active] = await mr.memberAtIndex(ROLE_MEMBER, memberId);

  if (!active) {
    return { member, amount: '0' };
  }

  const amount = await tc.tokensLocked(member, claReason);

  return { member, amount: amount.toString() };
}

const main = async provider => {
  const v1ClaimAssessment = [];

  const factory = await getContractFactory(provider);
  const [mr, tc] = await Promise.all([factory('MemberRoles'), factory('TokenController')]);

  const claReason = ethers.utils.formatBytes32String('CLA');
  const memberCount = (await mr.membersLength(ROLE_MEMBER)).toNumber();
  const membersSemaphore = new Sema(100, { capacity: memberCount });

  console.log('Fetching V1 Pooled Staking stake / rewards for all members...');

  const memberPromises = Array.from({ length: memberCount }).map(async (_, i) => {
    await membersSemaphore.acquire();

    try {
      const result = await getMemberCLA(i, claReason, mr, tc);
      if (result.amount !== '0') {
        v1ClaimAssessment.push(result);
      }
    } catch (e) {
      console.error(`Error processing memberId ${i}: ${e.message}`);
    }

    membersSemaphore.release();
  });

  await Promise.all(memberPromises);

  console.log(`Found ${v1ClaimAssessment.length} members with v1 Pooled Staking rewards`);

  console.log(`Writing output to ${OUTPUT_FILE}...`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(v1ClaimAssessment, null, 2), 'utf8');
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
