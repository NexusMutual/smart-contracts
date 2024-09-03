require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('node:fs/promises');
const { Sema } = require('async-sema');
const deployments = require('@nexusmutual/deployments');

const totalGas = 0;

const getContractFactory = provider => {
  const signer = provider.getSigner('0x87B2a7559d85f4653f13E6546A14189cd5455d45');
  return async contractName => {
    const abi = deployments.abis[contractName];
    const address = deployments.addresses[contractName];
    // const signer = wallet.connect(provider);
    return new ethers.Contract(address, abi, signer);
  };
};

const main = async provider => {
  const factory = getContractFactory(provider);
  const [tc, ps] = await Promise.all([factory('TokenController'), factory('LegacyPooledStaking')]);

  console.log('estimating withdrawing all V1 NXM members...');

  await withdrawCoverNotes(tc);
  await withdrawClaimsAssessment(tc);
  await withdrawV1StakingStake(ps);
  await withdrawV1StakingRewards(ps);
};

const withdrawCoverNotes = async tc => {
  const coverNotesData = require('../../v1-cn-locked-amount.json');

  let failed = 0;
  let success = 0;
  let totalGas = ethers.BigNumber.from(0);
  const membersSemaphore = new Sema(10, { capacity: coverNotesData.length });

  const promises = coverNotesData.map(async (data, i) => {
    const { member, coverIds, lockReasonIndexes } = data;
    process.stdout.write(`\rmember ${++i} of ${coverNotesData.length}`);

    await membersSemaphore.acquire();

    try {
      const gasEstimate = await tc.estimateGas.withdrawCoverNote(member, coverIds, lockReasonIndexes);
      totalGas = totalGas.add(gasEstimate);
      success++;
    } catch (e) {
      console.log(e);
      console.log({ member, coverIds, lockReasonIndexes });
      failed++;
    }

    membersSemaphore.release();
  });

  await Promise.all(promises);
  console.log('totalGas: ', totalGas);
  console.log({ success, failed });
};

const withdrawClaimsAssessment = async tokenController => {
  console.log('estimating v1 CLA tokens withdrawal...');
  const usersAndAmount = require('../../v1-cla-locked-amount.json');
  const users = usersAndAmount.map(data => data.member);
  const gasEstimate = await tokenController.estimateGas.withdrawClaimAssessmentTokens(users);
  console.log('CLA gasEstimate: ', gasEstimate);
};

const withdrawV1StakingStake = async pooledStaking => {
  const usersAndAmounts = require('../../v1-pooled-staking-stake.json');
  const users = usersAndAmounts.map(data => data.member);

  let totalGas = ethers.BigNumber.from(0);
  // const membersSemaphore = new Sema(10, { capacity: users.length });

  // const promises = users.map(async (user, i) => {
  let count = 0;
  for (const user of users) {
    process.stdout.write(`\rmember ${++count} of ${users.length}`);

    // await membersSemaphore.acquire();

    const gasEstimate = await pooledStaking.estimateGas.withdrawForUser(user);
    totalGas = totalGas.add(gasEstimate);

    // membersSemaphore.release();
  }
  // });

  // await Promise.all(promises);
  console.log('totalGas: ', totalGas);
};

const withdrawV1StakingRewards = async pooledStaking => {
  const usersAndAmounts = require('../../v1-pooled-staking-rewards.json');
  const users = usersAndAmounts.map(data => data.member);

  let totalGas = ethers.BigNumber.from(0);
  const membersSemaphore = new Sema(10, { capacity: users.length });

  const promises = users.map(async (user, i) => {
    process.stdout.write(`\rmember ${i + 1} of ${users.length}`);

    await membersSemaphore.acquire();

    const gasEstimate = await pooledStaking.estimateGas.withdrawReward(user);
    totalGas = totalGas.add(gasEstimate);

    membersSemaphore.release();
  });

  await Promise.all(promises);
  console.log('totalGas: ', totalGas);
};

if (require.main === module) {
  // use default provider and bypass cache when run via cli
  const provider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);
  main(provider)
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

const getGasCost = async (totalGas, gasPriceGwei) => {
  // const claGas = 2505458;
  // const stakeGas = 26646603;
  // const rewardsGas = 48516039;
  // const coverNotesGas = 182221106;
  // const totalGas = claGas + stakeGas + rewardsGas + coverNotesGas;
  // console.log('totalGas: ', totalGas);

  // Convert gas price from gwei to wei
  const gasPriceWei = ethers.utils.parseUnits(gasPriceGwei.toString(), 'gwei');

  // Calculate total cost in wei
  const totalCostWei = gasPriceWei.mul(totalGas);

  // Convert wei to ETH
  const totalCostEth = ethers.utils.formatEther(totalCostWei);

  return `${totalCostEth.toString()} ETH`;
};

const exec = async () => {
  console.log('3 gwei: ', await getGasCost(182221106, 3));
  console.log('5 gwei: ', await getGasCost(182221106, 5));
};

const getAmounts = (label, usersAndAmounts) => {
  const totalAmountNxm = usersAndAmounts.reduce((acc, data) => acc.add(data.amount), ethers.BigNumber.from(0));
  const totalNxm = ethers.utils.formatEther(totalAmountNxm);
  console.log(`${label} ${totalNxm} NXM`);
};

const amounts = () => {
  const stakeData = require('../../v1-pooled-staking-stake.json');
  const rewardsData = require('../../v1-pooled-staking-rewards.json');
  const claData = require('../../cla-locked-amount.json');
  const cnData = require('../../cn-locked-amount.json');
  getAmounts('Stake', stakeData);
  getAmounts('Rewards', rewardsData);
  getAmounts('CLA', claData);
  getAmounts('CN', cnData);
};

amounts();
// exec();

// 2 gwei: '0.519778412 ETH
// 3 gwei: '0.779667618 ETH
// 5 gwei: '1.29944603 ETH
// 10 gwei: '2.59889206 ETH
