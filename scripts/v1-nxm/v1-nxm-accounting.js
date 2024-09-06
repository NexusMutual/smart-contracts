const deployments = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { getContract } = require('./v1-nxm-push-utils');

async function logPoolBalances() {
  const tokenController = getContract('TokenController');
  const nxm = getContract('NXMToken');
  const stakingPoolFactory = getContract('StakingPoolFactory');

  let totalDeposits = ethers.BigNumber.from(0);
  let totalRewards = ethers.BigNumber.from(0);

  const stakingPoolCount = await stakingPoolFactory.stakingPoolCount();

  for (let poolId = 1; poolId <= stakingPoolCount.toNumber(); poolId++) {
    const { rewards, deposits } = await tokenController.stakingPoolNXMBalances(poolId);
    const depositsNXM = ethers.utils.formatEther(deposits);
    const rewardsNXM = ethers.utils.formatEther(rewards);

    console.log(`Pool ${poolId}: Deposits: ${depositsNXM} NXM, Rewards: ${rewardsNXM} NXM`);

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

  const tokenControllerBalance = await nxm.balanceOf(deployments.addresses.TokenController);
  console.log(`ACTUAL Token Controller Balance: ${ethers.utils.formatEther(tokenControllerBalance)} NXM`);

  const difference = tokenControllerBalance.sub(totalPoolBalance);
  const differenceNXM = ethers.utils.formatEther(difference);

  console.log(`Difference: ${differenceNXM} NXM`);
}

/* Get total v1 NXM amounts that is owed to members */
const getAmounts = (label, usersAndAmounts) => {
  const totalAmountNxm = usersAndAmounts.reduce((acc, data) => acc.add(data.amount), ethers.BigNumber.from(0));
  const totalNxm = ethers.utils.formatEther(totalAmountNxm);
  console.log(`${label} ${totalNxm} NXM`);
  return totalNxm;
};

async function legacyPooledStakingAccounting() {
  const nxm = getContract('NXMToken');

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
  legacyPooledStakingAccounting()
    .then(() => console.log('\n--------------------\n'))
    .then(() => logPoolBalances())
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}
