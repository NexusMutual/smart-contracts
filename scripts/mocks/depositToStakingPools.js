const { config, network, ethers } = require('hardhat');
const { AddressZero, MaxUint256 } = ethers.constants;

const { getCreate2Address, parseEther } = ethers.utils;

const INIT_CODE_HASH = '203b477dc328f1ceb7187b20e5b1b0f0bc871114ada7e9020c9ac112bbfb6920';
const STAKING_POOL_FACTORY = '0x68B1D87F95878fE05B998F19b66F4baba5De1aed';
const TOKEN = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';
const TOKEN_CONTROLLER = '0x0B306BF915C4d645ff596e518fAf3F9669b97016';

/**
 * @param {Number} poolId
 * @param {Signer} signer
 * @returns {Promise<StakingPool>}
 */
const getStakingPool = async (poolId, signer) => {
  const salt = Buffer.from(poolId.toString(16).padStart(64, '0'), 'hex');
  const initCodeHash = Buffer.from(INIT_CODE_HASH, 'hex');
  const stakingPoolAddress = getCreate2Address(STAKING_POOL_FACTORY, salt, initCodeHash);
  return await ethers.getContractAt('StakingPool', stakingPoolAddress, signer);
};

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  console.log('OWNER ADDRESS', owner.address);

  const staker = await ethers.getSigner('0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65');

  // Staking inputs
  const stakingAmount = parseEther('100');
  const { timestamp: now } = await ethers.provider.getBlock('latest');
  const firstActiveTrancheId = Math.floor(now / (91 * 24 * 3600));
  const lastActiveTrancheId = firstActiveTrancheId + 7;

  // Set allowance to token controller
  const token = await ethers.getContractAt('NXMToken', TOKEN);
  await token.connect(owner).approve(TOKEN_CONTROLLER, stakingAmount);
  await token.connect(staker).approve(TOKEN_CONTROLLER, stakingAmount);

  // Swap ETH for NXM
  const pool = await ethers.getContractAt('Pool', '0x5f3f1dBD7B74C6B46e8c44f98792A1dAf8d69154');
  const expectedTokensReceived = await pool.getNXMForEth(stakingAmount);
  await pool.connect(owner).buyNXM(expectedTokensReceived, { value: stakingAmount });
  const expectedTokensReceived2 = await pool.getNXMForEth(stakingAmount);
  await pool.connect(staker).buyNXM(expectedTokensReceived2, { value: stakingAmount });

  console.log('Deposit to staking pool id: 0');
  const stakingPoolZero = await getStakingPool(0, owner);
  const tx = await stakingPoolZero.depositTo(
    stakingAmount,
    lastActiveTrancheId,
    MaxUint256, // new position
    AddressZero, // destination
  );

  const { events } = await tx.wait();

  console.log('nft id', events[0]);

  console.log('Deposit to staking pool id: 1');
  const stakingPoolOne = await getStakingPool(1, owner);
  await stakingPoolOne.depositTo(
    stakingAmount,
    lastActiveTrancheId,
    MaxUint256, // new position
    AddressZero, // destination
  );

  console.log('Deposited successfully!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
