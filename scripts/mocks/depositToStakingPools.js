const { config, network, ethers } = require('hardhat');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();

  const stakingPoolFactory = await ethers.getContractAt(
    'StakingPoolFactory',
    '0x68B1D87F95878fE05B998F19b66F4baba5De1aed',
  );

  console.log('OWNER ADDRESS', owner.address);

  // Staking inputs
  const stakingAmount = parseEther('100');
  const lastBlock = await ethers.provider.getBlock('latest');
  const period = 3600 * 24 * 30; // 30 days
  const gracePeriod = 3600 * 24 * 30;
  const firstTrancheId = Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));

  console.log('Deposit to staking pool id: 0');
  let poolId = 0;
  let salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  let requiredHash = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
  let initCodeHash = Buffer.from(requiredHash, 'hex');
  let stakingPoolAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);
  let stakingPoolInstance = await ethers.getContractAt('StakingPool', stakingPoolAddress);
  console.log('stakingPoolInstance', stakingPoolInstance.address);
  console.log('firstTrancheId', firstTrancheId);
  let staker = owner;
  console.log('staker', staker.address);
  // Stake to open up capacity
  await stakingPoolInstance.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    MaxUint256, // new position
    AddressZero, // destination
  );
  console.log('Deposited successfully!');

  console.log('Deposit to staking pool id: 1');
  poolId = 1;
  salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  requiredHash = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
  initCodeHash = Buffer.from(requiredHash, 'hex');
  stakingPoolAddress = ethers.utils.getCreate2Address(stakingPoolFactory.address, salt, initCodeHash);
  stakingPoolInstance = await ethers.getContractAt('StakingPool', stakingPoolAddress);
  console.log('stakingPoolInstance', stakingPoolInstance.address);
  console.log('firstTrancheId', firstTrancheId);
  staker = await ethers.getSigner('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');
  console.log('staker', staker.address);
  // Stake to open up capacity
  await stakingPoolInstance.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    MaxUint256, // new position
    AddressZero, // destination
  );
  console.log('Deposited successfully!');

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
