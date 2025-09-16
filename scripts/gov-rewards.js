const fs = require('node:fs');
const { ethers } = require('hardhat');

const fetchRewards = async () => {
  const abi = ['function getPendingReward(address member) public view returns (uint)'];
  const governance = await ethers.getContractAt(abi, '0x4A5C681dDC32acC6ccA51ac17e9d461e6be87900');

  const voters = require('./voters.json');
  const rewards = {};

  for (const voter of voters) {
    console.log('Fetching rewards for', voter);
    const reward = await governance.getPendingReward(voter);

    if (!reward.isZero()) {
      rewards[voter] = reward.toString();
      console.log(`${voter}: ${reward}`);
    }
  }

  fs.writeFileSync('./gov-rewards.json', JSON.stringify(rewards, null, 2));
};

const main = async () => {
  if (!fs.existsSync('./gov-rewards.json')) {
    await fetchRewards();
  }

  const rewards = JSON.parse(fs.readFileSync('./gov-rewards.json', 'utf8'));
  const keys = Object.keys(rewards);
  const total = keys.reduce((acc, key) => acc.add(rewards[key]), ethers.constants.Zero);
  console.log(`Total rewards: ${ethers.utils.formatEther(total)} NXM`);
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
