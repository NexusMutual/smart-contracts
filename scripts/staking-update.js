const { ethers, network } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');
const { abis, addresses, StakingPoolFactory, StakingNFT, StakingViewer } = require('@nexusmutual/deployments');
const evm = require('../test/fork/evm')();

const { waitForInput } = require('../lib/helpers');

const { AWS_REGION, AWS_KMS_KEY_ID } = process.env;
const TRANCHE_DURATION = 91 * 24 * 3600; // 91 days

async function main() {
  // await evm.connect(ethers.provider);
  console.log('URL: ', network.config.url);
  // Get or revert snapshot if network is tenderly
  if (network.name === 'tenderly') {
    const { TENDERLY_SNAPSHOT_ID } = process.env;
    if (TENDERLY_SNAPSHOT_ID) {
      await evm.revert(TENDERLY_SNAPSHOT_ID);
      console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
    } else {
      console.info('Snapshot ID: ', await evm.snapshot());
    }
  }

  const viewer = await ethers.getContractAt(StakingViewer, addresses.StakingViewer);
  const stakingNFT = await ethers.getContractAt(StakingNFT, addresses.StakingNFT);
  const factory = await ethers.getContractAt(StakingPoolFactory, addresses.StakingPoolFactory);

  const now = (await ethers.provider.getBlock('latest')).timestamp;
  const currentTrancheId = Math.floor(now / TRANCHE_DURATION);

  const tokenCount = (await stakingNFT.totalSupply()).toNumber();
  console.log('tokenCount: ', tokenCount);
  const tokenIds = new Array(tokenCount).fill('').map((_, i) => i + 1);
  console.log('tokenIds: ', tokenIds);
  const stakingPoolCount = (await factory.stakingPoolCount()).toNumber();
  const stakingPoolIds = new Array(stakingPoolCount).fill('').map((_, i) => i + 1);

  console.log('Fetching tokens and deposits');
  const [, encodedTokensWithDeposits] = await viewer.callStatic.multicall([
    viewer.interface.encodeFunctionData('processExpirations', [stakingPoolIds]),
    viewer.interface.encodeFunctionData('getTokens', [tokenIds]),
  ]);
  console.log('\n ****** data \n', encodedTokensWithDeposits); // encodedTokensWithDeposits
  return;

  const [tokensWithDeposits] = viewer.interface.decodeFunctionResult('getTokens', encData);

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

  // const signer = new AwsKmsSigner(AWS_REGION, AWS_KMS_KEY_ID, ethers.provider);
  const swapOperator = await ethers.getContractAt(abis.SwapOperator, addresses.SwapOperator);
  const swapController = await swapOperator.swapController();
  console.log('swapController: ', swapController);
  await evm.impersonate(swapController);
  await evm.setBalance(swapController, ethers.utils.parseEther('1000'));
  console.log('network.config.url: ', network.config.url);
  const provider = new ethers.providers.JsonRpcProvider(network.config.url);
  const signer = provider.getSigner(swapController);
  const cover = await ethers.getContractAt('Cover', addresses.Cover, signer);
  const txData = cover.interface.encodeFunctionData('updateStakingPoolsRewardShares', [data]);

  // console.log('signer:', await signer.getAddress());
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
