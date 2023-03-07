const { ethers } = require('hardhat');

const [numOfDays] = process.argv.slice(2);

const main = async () => {
  await ethers.provider.send('evm_increaseTime', numOfDays ? [86400 * numOfDays] : [86400 * 3]);
  await ethers.provider.send('evm_mine', []);
};

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
