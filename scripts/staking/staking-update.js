require('dotenv').config();
const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');
const { addresses, StakingPoolFactory, StakingNFT, StakingViewer } = require('@nexusmutual/deployments');

const { waitForInput } = require('../lib/helpers');

const { AWS_REGION, AWS_KMS_KEY_ID } = process.env;
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

  const signer = new AwsKmsSigner(AWS_KMS_KEY_ID, AWS_REGION, ethers.provider);
  const cover = await ethers.getContractAt('Cover', addresses.Cover, signer);
  const txData = cover.interface.encodeFunctionData('updateStakingPoolsRewardShares', [data]);

  console.log('signer:', await signer.getAddress());
  console.log('to:', addresses.Cover);
  console.log('data: ', txData);

  await waitForInput('Press enter key to continue...');
  console.log('Calling updateStakingPoolsRewardShares');

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
