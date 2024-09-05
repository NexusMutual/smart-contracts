require('dotenv').config();
const deployments = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { getContract } = require('./v1-nxm-push-utils');

async function logPoolBalances(provider) {
  const tokenController = await getContract('TokenController', provider);

  let totalDeposits = ethers.BigNumber.from(0);
  let totalRewards = ethers.BigNumber.from(0);

  for (let poolId = 1; poolId <= 25; poolId++) {
    const { rewards, deposits } = await tokenController.stakingPoolNXMBalances(poolId);
    const depositsETH = ethers.utils.formatEther(deposits);
    const rewardsETH = ethers.utils.formatEther(rewards);

    console.log(`Pool ${poolId}: Deposits: ${depositsETH} ETH, Rewards: ${rewardsETH} ETH`);

    totalDeposits = totalDeposits.add(deposits);
    totalRewards = totalRewards.add(rewards);
  }

  const cnData = require('../../v1-cn-locked-amount.json');
  const claData = require('../../v1-cla-locked-amount.json');
  const cnBalance = cnData.reduce((acc, data) => acc.add(data.amount), ethers.BigNumber.from(0));
  const claBalance = claData.reduce((acc, data) => acc.add(data.amount), ethers.BigNumber.from(0));

  const totalDepositsNXM = ethers.utils.formatEther(totalDeposits);
  const totalRewardsNXM = ethers.utils.formatEther(totalRewards);
  const totalCnBalanceNXM = ethers.utils.formatEther(cnBalance);
  const totalClaBalanceNXM = ethers.utils.formatEther(claBalance);

  console.log(`Total Deposits: ${totalDepositsNXM} NXM`);
  console.log(`Total Rewards: ${totalRewardsNXM} NXM`);
  console.log(`CN Balance: ${totalCnBalanceNXM} NXM`);
  console.log(`CLA Balance: ${totalClaBalanceNXM} NXM`);

  const totalPoolBalance = totalDeposits.add(totalRewards).add(cnBalance).add(claBalance);
  console.log(`EXPECTED Total Pool Balance: ${ethers.utils.formatEther(totalPoolBalance)} NXM`);

  const tokenControllerBalance = ethers.utils.parseEther('507780.73694946');
  console.log(`ACTUAL Token Controller Balance: ${ethers.utils.formatEther(tokenControllerBalance)} NXM`);

  const difference = tokenControllerBalance.sub(totalPoolBalance);
  const differenceETH = ethers.utils.formatEther(difference);

  console.log(`Difference: ${differenceETH} NXM`);
}

/* Get total v1 NXM amounts that is owed to members */
const getAmounts = (label, usersAndAmounts) => {
  const totalAmountNxm = usersAndAmounts.reduce((acc, data) => acc.add(data.amount), ethers.BigNumber.from(0));
  const totalNxm = ethers.utils.formatEther(totalAmountNxm);
  console.log(`${label} ${totalNxm} NXM`);
  return totalNxm;
};

async function legacyPooledStakingAccounting(provider) {
  const nxm = getContract('NXMToken', provider);

  const psBal = await nxm.balanceOf(deployments.addresses.LegacyPooledStaking);
  const psBalNxm = ethers.utils.formatEther(psBal);

  const stakeData = require('../../v1-pooled-staking-stake.json');
  const rewardsData = require('../../v1-pooled-staking-rewards.json');
  const v1NxmStake = getAmounts('Stake', stakeData);
  const v1NxmRewards = getAmounts('Rewards', rewardsData);
  console.log(`LegacyPooledStaking ${psBalNxm} NXM`);

  console.log(`LegacyPooledStaking Difference ${psBalNxm - v1NxmRewards - v1NxmStake} NXM`);
}

if (require.main === module) {
  const provider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);

  legacyPooledStakingAccounting(provider)
    .then(() => console.log('\n--------------------\n'))
    .then(() => logPoolBalances(provider))
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}
