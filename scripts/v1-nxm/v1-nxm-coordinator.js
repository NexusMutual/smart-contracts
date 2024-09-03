require('dotenv').config();
const { ethers } = require('ethers');
const { Sema } = require('async-sema');
const fs = require('fs/promises');
const { addresses, TokenController, LegacyPooledStaking } = require('@nexusmutual/deployments');
const { pushCoverNotes, pushClaimsAssessment, pushV1StakingStake, pushV1StakingRewards } = require('./v1-nxm-push');

const PROGRESS_FILE = 'v1-nxm-progress.json';

async function getGasFees(provider, maxGasFee, priorityFee) {
  const { baseFeePerGas } = await provider.getBlock('pending');
  if (!baseFeePerGas) {
    throw new Error('Failed to get baseFeePerGas. Please try again');
  }
  const priorityFeeWei = ethers.utils.parseUnits(priorityFee.toString(), 'gwei');
  const maxFeeWei = ethers.utils.parseUnits(maxGasFee.toString(), 'gwei');
  return {
    maxFeePerGas: maxFeeWei,
    maxPriorityFeePerGas: priorityFeeWei,
  };
}

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function processV1NXM(provider, maxGasFee, priorityFee, txPerBlock) {
  // TODO: use AWS KMS signer
  const signer = provider.getSigner('0x87B2a7559d85f4653f13E6546A14189cd5455d45');
  const tc = new ethers.Contract(addresses.TokenController, TokenController, signer);
  const ps = new ethers.Contract(addresses.LegacyPooledStaking, LegacyPooledStaking, signer);

  const types = [
    { name: 'CoverNotes', data: require('../../v1-cn-locked-amount.json'), func: pushCoverNotes },
    { name: 'ClaimsAssessment', data: require('../../v1-cla-locked-amount.json'), func: pushClaimsAssessment },
    { name: 'StakingStake', data: require('../../v1-pooled-staking-stake.json'), func: pushV1StakingStake },
    { name: 'StakingRewards', data: require('../../v1-pooled-staking-rewards.json'), func: pushV1StakingRewards },
  ];

  let progress = await loadProgress();

  for (const type of types) {
    progress[type.name] ||= { processedCount: 0 };
    const remainingData = type.data.slice(progress[type.name].processedCount);

    while (remainingData.length > 0) {
      const gasFees = await getGasFees(provider, maxGasFee, priorityFee);
      if (gasFees.maxFeePerGas.gt(ethers.utils.parseUnits(maxGasFee.toString(), 'gwei'))) {
        console.log('Gas fee too high. Waiting for next block...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // Wait for ~15 seconds (average Ethereum block time)
        continue;
      }

      const batch = remainingData.slice(0, txPerBlock);
      const semaphore = new Sema(txPerBlock);

      const promises = batch.map(async (item) => {
        await semaphore.acquire();
        try {
          await type.func({ tc, ps }, [item], txPerBlock);
        } finally {
          semaphore.release();
        }
      });

      await Promise.all(promises);
      
      // Update progress
      progress[type.name].processedCount += batch.length;
      
      await saveProgress(progress);
      
      // splice is not performant, but the data is small so its fine (prefer readability)
      remainingData.splice(0, txPerBlock);
    }
  }

  console.log('All v1 NXM types processed successfully.');
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    console.error('Usage: node v1-nxm-coordinator.js <maxGasFee> <priorityFee> <txPerBlock>');
    process.exit(1);
  }

  const [maxGasFeeGwei, priorityFeeGwei, txPerBlock] = args.map(Number);
  const provider = new ethers.providers.JsonRpcProvider(process.env.TEST_ENV_FORK);

  processV1NXM(provider, maxGasFeeGwei, priorityFeeGwei, txPerBlock)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = {
  processV1NXM,
};