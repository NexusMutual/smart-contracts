const deployments = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const getContractFactory = async providerOrSigner => {
  return async contractName => {
    const abi = deployments[contractName];
    const address = deployments.addresses[contractName];
    return new ethers.Contract(address, abi, providerOrSigner);
  };
};

async function logPoolBalances(provider) {
  const factory = await getContractFactory(provider);
  const TokenController = await factory('TokenController');

  let totalDeposits = ethers.BigNumber.from(0);
  let totalRewards = ethers.BigNumber.from(0);

  for (let poolId = 1; poolId <= 25; poolId++) {
    const { rewards, deposits } = await TokenController.stakingPoolNXMBalances(poolId);
    const depositsETH = ethers.utils.formatEther(deposits);
    const rewardsETH = ethers.utils.formatEther(rewards);

    console.log(`Pool ${poolId}: Deposits: ${depositsETH} ETH, Rewards: ${rewardsETH} ETH`);

    totalDeposits = totalDeposits.add(deposits);
    totalRewards = totalRewards.add(rewards);
  }

  const cnBalance = ethers.utils.parseEther('13479.635746436787');
  const claBalance = ethers.utils.parseEther('2102.67024');

  const totalDepositsETH = ethers.utils.formatEther(totalDeposits);
  const totalRewardsETH = ethers.utils.formatEther(totalRewards);
  const totalCnBalanceETH = ethers.utils.formatEther(cnBalance);
  const totalClaBalanceETH = ethers.utils.formatEther(claBalance);

  console.log(`Total Deposits: ${totalDepositsETH} ETH`);
  console.log(`Total Rewards: ${totalRewardsETH} ETH`);
  console.log(`CN Balance: ${totalCnBalanceETH} ETH`);
  console.log(`CLA Balance: ${totalClaBalanceETH} ETH`);

  const totalPoolBalance = totalDeposits.add(totalRewards).add(cnBalance).add(claBalance);
  console.log(`EXPECTED Total Pool Balance: ${ethers.utils.formatEther(totalPoolBalance)} ETH`);

  const tokenControllerBalance = ethers.utils.parseEther('507780.73694946');
  console.log(`ACTUAL Token Controller Balance: ${ethers.utils.formatEther(tokenControllerBalance)} ETH`);

  const difference = tokenControllerBalance.sub(totalPoolBalance);
  const differenceETH = ethers.utils.formatEther(difference);

  console.log(`Difference: ${differenceETH} ETH`);
}

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider('https://mainnet.gateway.tenderly.co/1fszebY5zJfEzQPs7VUgYm');
  logPoolBalances(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}
