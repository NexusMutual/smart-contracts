const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');

const { multicall, encodeWithSelector, decodeResult } = nexus.multicall;

const GOVERNANCE = '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900';
const abi = ['function getPendingReward(address member) public view returns (uint)'];

/// Script to get member governance rewards
/// Note: execute `npx hardhat run ./scripts/v3-migration/01-get-all-member-addresses.js --network mainnet` first

const fetchRewards = async members => {
  const governance = await ethers.getContractAt(abi, GOVERNANCE);
  const calls = members.map(member => ({
    target: GOVERNANCE,
    callData: encodeWithSelector(governance.getPendingReward.fragment, [member]),
  }));

  const rewards = (await multicall(calls, ethers.provider, 200)) //
    .map(data => decodeResult(governance.getPendingReward.fragment, data))
    .map(([reward], index) => ({ address: members[index], reward }))
    .filter(({ reward }) => reward > 0n);

  return rewards;
};

const main = async () => {
  const infile = path.join(__dirname, 'data/members.json');
  const members = JSON.parse(fs.readFileSync(infile, 'utf8'));
  const rewards = await fetchRewards(members);

  const total = rewards.reduce((acc, item) => acc + item.reward, 0n);
  console.log(`Total rewards: ${ethers.formatEther(total)} NXM to ${rewards.length} addresses`);

  const data = rewards.map(({ address, reward }) => ({ address, reward: reward.toString() }));
  const outfile = path.join(__dirname, 'data/gov-rewards.json');
  fs.writeFileSync(outfile, JSON.stringify(data, null, 2));
};

module.exports = { fetchRewards };

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
