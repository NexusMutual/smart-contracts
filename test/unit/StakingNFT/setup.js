const { ethers } = require('hardhat');
const { setBalance } = require('@nomicfoundation/hardhat-network-helpers');
const { getAccounts } = require('../../utils/accounts');

const { parseEther } = ethers;

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);
  const cover = await ethers.deployContract('SNFTMockCover', [stakingPoolFactory.target]);
  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');

  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'NexusMutual Staking',
    'NXMS',
    stakingPoolFactory.target,
    cover.target,
    stakingNFTDescriptor.target,
  ]);

  await cover.setStakingNFT(stakingNFT.target);

  // impersonate staking pool address
  const poolId = 50;
  const stakingAddress = await cover.stakingPool(poolId);
  await setBalance(stakingAddress, parseEther('1000'));
  await setBalance(cover.target, parseEther('1000'));
  const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingAddress);
  const coverSigner = await ethers.getImpersonatedSigner(cover.target);

  return {
    contracts: {
      nftDescriptor: stakingNFTDescriptor,
      cover,
      stakingPoolFactory,
      stakingNFT,
    },
    accounts,
    stakingPoolSigner,
    coverSigner,
    poolId,
  };
}

module.exports = setup;
