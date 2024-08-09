const { ethers } = require('hardhat');
const { addresses, StakingPoolFactory, StakingNFT, StakingViewer } = require('@nexusmutual/deployments');

const { toBytes2 } = require('../lib/helpers');

const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days

async function main() {
  const viewer = await ethers.getContractAt(StakingViewer, addresses.StakingViewer);
  const stakingNFT = await ethers.getContractAt(StakingNFT, addresses.StakingNFT);
  const factory = await ethers.getContractAt(StakingPoolFactory, addresses.StakingPoolFactory);

  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

  const tokenCount = (await stakingNFT.totalSupply()).toNumber();
  const tokenIds = new Array(tokenCount).fill('').map((_, i) => i + 1);

  const stakingPoolCount = (await factory.stakingPoolCount()).toNumber();
  const stakingPoolIds = new Array(stakingPoolCount).fill('').map((_, i) => i + 1);

  console.log('Fetching tokens and deposits');
  const [, encodedTokensWithDeposits] = await viewer.callStatic.multicall([
    viewer.interface.encodeFunctionData('processExpirations', [stakingPoolIds]),
    viewer.interface.encodeFunctionData('getTokens', [tokenIds]),
  ]);

  const [tokensWithDeposits] = viewer.interface.decodeFunctionResult('getTokens', encodedTokensWithDeposits);

  // data[ pool_id ][ tranche_idx ] => [token ids]
  const data = stakingPoolIds.map(() => new Array(8).fill('').map(() => []));

  for (const tokenWithDeposits of tokensWithDeposits) {
    const tokenId = tokenWithDeposits.tokenId.toNumber();
    const poolId = tokenWithDeposits.poolId.toNumber();
    const poolIdx = poolId - 1;

    for (const deposit of tokenWithDeposits.deposits) {
      const trancheIdx = deposit.trancheId.toNumber() - currentTrancheId;

      if (trancheIdx < 0) {
        // skip expired tranches
        continue;
      }

      data[poolIdx][trancheIdx].push(tokenId);
    }
  }

  console.log('Deploying contracts');

  const extras = await ethers.deployContract('StakingExtrasLib');
  await extras.deployed();

  const newStakingPool = await ethers.deployContract(
    'StakingPool',
    [
      addresses.StakingNFT,
      addresses.NXMToken,
      addresses.Cover,
      addresses.TokenController,
      addresses.NXMaster,
      addresses.StakingProducts,
    ],
    { libraries: { StakingExtrasLib: extras.address } },
  );
  await newStakingPool.deployed();

  const newCover = await ethers.deployContract('Cover', [
    addresses.CoverNFT,
    addresses.StakingNFT,
    addresses.StakingPoolFactory,
    newStakingPool.address,
  ]);
  await newCover.deployed();

  console.log('Upgrading contracts');

  // impersonate governance to upgrade cover
  const govSigner = ethers.provider.getSigner(addresses.Governance);
  const balance = ethers.utils.parseEther('1000');
  await ethers.provider.send('hardhat_setBalance', [addresses.Governance, ethers.utils.hexValue(balance)]);
  await ethers.provider.send('hardhat_impersonateAccount', [addresses.Governance]);

  const master = await ethers.getContractAt('NXMaster', addresses.NXMaster, govSigner);
  await master.upgradeMultipleContracts([toBytes2('CO')], [newCover.address]);

  const cover = await ethers.getContractAt('Cover', addresses.Cover, govSigner);
  const txData = cover.interface.encodeFunctionData('updateStakingPoolsRewardShares', [data]);

  console.log('to:', addresses.Cover);
  console.log('data: ', txData);

  const tx = await cover.updateStakingPoolsRewardShares(data);
  const receipt = await tx.wait();

  console.log('Tx gas:', receipt.gasUsed.toString());
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
