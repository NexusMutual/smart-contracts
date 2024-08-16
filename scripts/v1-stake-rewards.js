const { ethers } = require('hardhat');
const fs = require('fs');
const { Sema } = require('async-sema');
const deployments = require('@nexusmutual/deployments');

const OUTPUT_PATH_STAKE = 'v1-pooled-staking-stake.json';
const OUTPUT_PATH_REWARDS = 'v1-pooled-staking-rewards.json';
const ROLE_MEMBER = 2;

const getContractFactory = providerOrSigner => {
  return contractName => {
    const abi = deployments[contractName];
    const address = deployments.addresses[contractName];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

const getMemberV1PooledStaking = async (memberId, mr, ps) => {
  process.stdout.write(`\rProcessing memberId ${memberId}`);

  const [member, active] = await mr.memberAtIndex(ROLE_MEMBER, memberId);

  if (!active) {
    return {
      stake: { member, amount: '0' },
      rewards: { member, amount: '0' },
    };
  }

  const [deposit, rewards] = await Promise.all([ps.stakerDeposit(member), ps.stakerReward(member)]);

  return {
    stake: { member, amount: deposit.toString() },
    rewards: { member, amount: rewards.toString() },
  };
};

const main = async provider => {
  const v1Stake = [];
  const v1Rewards = [];

  const factory = getContractFactory(provider);
  const [mr, ps] = await Promise.all([factory('MemberRoles'), factory('LegacyPooledStaking')]);

  const membersCount = await mr.membersLength(ROLE_MEMBER);
  const membersSemaphore = new Sema(100, { capacity: membersCount });

  console.log('Fetching V1 Pooled Staking stake / rewards for all members...');

  const memberPromises = Array.from({ length: membersCount }).map(async (_, i) => {
    await membersSemaphore.acquire();

    const { stake, rewards } = await getMemberV1PooledStaking(i, mr, ps);
    if (stake.amount !== '0') {
      v1Stake.push(stake);
    }
    if (rewards.amount !== '0') {
      v1Rewards.push(rewards);
    }

    membersSemaphore.release();
  });

  await Promise.all(memberPromises);

  console.log(`Found ${v1Stake.length} members with v1 Pooled Staking stake`);
  console.log(`Found ${v1Rewards.length} members with v1 Pooled Staking rewards`);

  console.log(`Writing output to ${OUTPUT_PATH_STAKE}/${OUTPUT_PATH_REWARDS}...`);
  fs.writeFileSync(OUTPUT_PATH_STAKE, JSON.stringify(v1Stake, null, 2), 'utf8');
  fs.writeFileSync(OUTPUT_PATH_REWARDS, JSON.stringify(v1Rewards, null, 2), 'utf8');
  console.log('Done.');
};

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider('https://mainnet.gateway.tenderly.co/1fszebY5zJfEzQPs7VUgYm');
  main(provider, false)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}
