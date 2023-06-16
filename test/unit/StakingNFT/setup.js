const { ethers } = require('hardhat');
const { setEtherBalance } = require('../../utils/evm');
const { getAccounts } = require('../../utils/accounts');

async function setup() {
  const accounts = await getAccounts();
  const [operator] = accounts.members;

  const stakingPoolFactory = await ethers.deployContract('StakingPoolFactory', [operator.address]);
  const cover = await ethers.deployContract('SNFTMockCover', [stakingPoolFactory.address]);
  const stakingNFTDescriptor = await ethers.deployContract('StakingNFTDescriptor');

  const stakingNFT = await ethers.deployContract('StakingNFT', [
    'NexusMutual Staking',
    'NXMS',
    stakingPoolFactory.address,
    cover.address,
    stakingNFTDescriptor.address,
  ]);

  await cover.setStakingNFT(stakingNFT.address);

  // impersonate staking pool address
  const poolId = 50;
  const stakingAddress = await cover.stakingPool(poolId);
  await setEtherBalance(stakingAddress, ethers.utils.parseEther('1000'));
  await setEtherBalance(cover.address, ethers.utils.parseEther('1000'));
  const stakingPoolSigner = await ethers.getImpersonatedSigner(stakingAddress);
  const coverSigner = await ethers.getImpersonatedSigner(cover.address);

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
