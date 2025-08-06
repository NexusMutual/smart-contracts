const fs = require('node:fs');
const path = require('node:path');
const { ethers } = require('hardhat');

const fetchRewards = async () => {
  const abi = ['function getPendingReward(address member) public view returns (uint)'];
  const governance = await ethers.getContractAt(abi, '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900');

  const votersPath = path.join(__dirname, 'voters.json');
  const voters = require(votersPath);
  const rewards = {};

  for (const voter of voters) {
    console.log('Fetching rewards for', voter);
    const reward = await governance.getPendingReward(voter);
    if (reward !== 0n) {
      const rewardsFormatted = ethers.formatEther(reward);
      rewards[voter] = rewardsFormatted;
      console.log(`${voter}: ${rewardsFormatted}`);
    }
  }

  const govRewardsPath = path.join(__dirname, 'gov-rewards.json');
  fs.writeFileSync(govRewardsPath, JSON.stringify(rewards, null, 2));
};

const main = async () => {
  const govRewardsPath = path.join(__dirname, 'gov-rewards.json');

  if (!fs.existsSync(govRewardsPath)) {
    await fetchRewards();
  }

  const rewards = JSON.parse(fs.readFileSync(govRewardsPath, 'utf8'));
  const keys = Object.keys(rewards);
  const total = keys.reduce((acc, key) => acc + Number(rewards[key]), 0);
  console.log(`Total rewards: ${total} NXM`);
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
