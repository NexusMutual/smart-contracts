const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');

const { multicall, encodeWithSelector, decodeResult } = nexus.multicall;

const GOVERNANCE = '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900';
const abi = ['function getPendingReward(address member) public view returns (uint)'];

const fetchRewards = async members => {
  const governance = await ethers.getContractAt(abi, GOVERNANCE);
  const calls = members.map(member => ({
    target: GOVERNANCE,
    callData: encodeWithSelector(governance.getPendingReward.fragment, [member]),
  }));

  const rewards = (await multicall(calls, 200)) //
    .map((data, index) => ({
      address: members[index],
      reward: decodeResult(governance.getPendingReward.fragment, data),
    }));

  console.log('rewards', rewards);

  return rewards;
};

const main = async () => {
  const members = require('./data/members.json');
  const rewards = await fetchRewards(members.slice(0, 10));

  const outfile = path.join(__dirname, 'data/gov-rewards.json');
  fs.writeFileSync(outfile, JSON.stringify(rewards, null, 2));

  const total = rewards.reduce((acc, item) => acc + item.reward, 0);
  console.log(`Total rewards: ${ethers.formatEther(total)} NXM`);
};

module.exports = { fetchRewards };

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
