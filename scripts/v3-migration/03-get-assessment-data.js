const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');
const { addresses, Assessment } = require('@nexusmutual/deployments');

const { multicall, encodeWithSelector, decodeResult } = nexus.multicall;

/// Script to get member assessment data (stake and rewards)
/// Important: It assumes the cooldown for all assessments has ended and there are no "pending" (unclaimable) rewards.
/// Note: execute `npx hardhat run ./scripts/v3-migration/01-get-all-member-addresses.js --network mainnet` first

const fetchRewards = async members => {
  console.log('Fetching assessment rewards...');
  const assessmentContract = await ethers.getContractAt(Assessment, addresses.Assessment);

  const calls = members.map(member => ({
    target: addresses.Assessment,
    callData: encodeWithSelector(assessmentContract.getRewards.fragment, [member]),
  }));

  const rewards = (await multicall(calls, ethers.provider, 200))
    .map(data => decodeResult(assessmentContract.getRewards.fragment, data))
    .map(([total], index) => ({ address: members[index], rewards: total }));

  return rewards;
};

const fetchStakes = async members => {
  console.log('Fetching assessment stake...');
  const assessmentContract = await ethers.getContractAt(Assessment, addresses.Assessment);

  const calls = members.map(member => ({
    target: addresses.Assessment,
    callData: encodeWithSelector(assessmentContract.stakeOf.fragment, [member]),
  }));

  const stakes = (await multicall(calls, ethers.provider, 200))
    .map(data => decodeResult(assessmentContract.stakeOf.fragment, data))
    .map(([amount], index) => ({ address: members[index], stake: amount }));

  return stakes;
};

async function main() {
  const infile = path.join(__dirname, 'data/members.json');
  const members = JSON.parse(fs.readFileSync(infile, 'utf8'));
  console.log(`Found ${members.length} member addresses...`);

  const rewards = await fetchRewards(members);
  const rewardsObject = Object.fromEntries(rewards.map(r => [r.address, r.rewards]));

  const stakes = await fetchStakes(members);
  const stakeObject = Object.fromEntries(stakes.map(s => [s.address, s.stake]));

  const result = members
    .map(member => ({
      address: member,
      rewards: rewardsObject[member].toString(),
      stake: stakeObject[member].toString(),
    }))
    .filter(({ rewards, stake }) => rewards !== '0' || stake !== '0');

  const outputPath = path.join(__dirname, 'data/assessment-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

  console.log(`Data saved to: ${outputPath}`);
  console.log(`Total addresses with data: ${result.length}`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { fetchRewards, fetchStakes };
