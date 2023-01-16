const { config, network, ethers } = require('hardhat');
const { AddressZero, MaxUint256 } = ethers.constants;
const { parseEther } = ethers.utils;

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  console.log('OWNER ADDRESS', owner.address);

  const productId = 0;
  const targetPrice = 1000;
  const initialPrice = 10000;

  const isPrivatePool = false;
  const initialPoolFee = '5';
  const maxPoolFee = '5';
  const productInitializationParams = [
    {
      productId: 73,
      weight: '40',
      initialPrice,
      targetPrice,
    },
    {
      productId,
      weight: '40',
      initialPrice,
      targetPrice,
    },
    {
      productId: 1,
      weight: '20',
      initialPrice,
      targetPrice,
    },
  ];
  const stakingPoolManager = { address: owner.address };

  const cover = await ethers.getContractAt('Cover', '0x4A679253410272dd5232B3Ff7cF5dbB88f295319');
  const stakingPool = await ethers.getContractAt('StakingPool', '0x1291Be112d480055DaFd8a610b7d1e203891C274');

  console.log('Creating 1st staking pool');
  await cover.createStakingPool(
    stakingPoolManager.address,
    isPrivatePool,
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    '', // ipfsDescriptionHash
  );
  console.log('1st staking pool was created.');

  // Staking inputs
  const stakingAmount = parseEther('10000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const period = 3600 * 24 * 30; // 30 days
  const gracePeriod = 3600 * 24 * 30;
  const firstTrancheId = Math.floor((lastBlock.timestamp + period + gracePeriod) / (91 * 24 * 3600));

  console.log('Deposit to 1st staking pool');
  // Stake to open up capacity
  await stakingPool.connect(owner).depositTo(
    stakingAmount,
    firstTrancheId,
    MaxUint256, // new position
    AddressZero, // destination
  );
  console.log('Deposited successfully!');

  console.log('Creating 2nd staking pool');
  await cover.createStakingPool(
    stakingPoolManager.address,
    true, // isPrivatePool
    initialPoolFee,
    maxPoolFee,
    productInitializationParams,
    '', // ipfsDescriptionHash
  );
  console.log('2nd staking pool was created.');

  // Staking inputs
  const lastBlock2 = await ethers.provider.getBlock('latest');
  const firstTrancheId2 = Math.floor((lastBlock2.timestamp + period + gracePeriod) / (91 * 24 * 3600));

  console.log('Deposit to 2nd staking pool');
  // Stake to open up capacity
  await stakingPool.connect(owner).depositTo(
    stakingAmount,
    firstTrancheId2,
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
