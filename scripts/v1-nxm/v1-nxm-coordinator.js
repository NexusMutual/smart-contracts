require('dotenv').config();
const fs = require('node:fs/promises');
const util = require('node:util');

const { addresses, TokenController, LegacyPooledStaking } = require('@nexusmutual/deployments');
const { Sema } = require('async-sema');
const { ethers } = require('ethers');

const { pushCoverNotes, pushClaimsAssessment, pushV1StakingStake, pushV1StakingRewards } = require('./v1-nxm-push');

const PROGRESS_FILE = 'v1-nxm-progress.json';

const waitFor = util.promisify(setTimeout);

async function getGasFees(provider, priorityFee) {
  const { baseFeePerGas } = await provider.getBlock('pending');
  if (!baseFeePerGas) {
    throw new Error('Failed to get baseFeePerGas. Please try again');
  }
  const priorityFeeWei = ethers.utils.parseUnits(priorityFee.toString(), 'gwei');
  const maxFeePerGas = baseFeePerGas.add(priorityFeeWei);

  return maxFeePerGas;
}

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

async function processV1NXM(provider, userMaxFeePerGasGwei, priorityFeeGwei, txPerBlock) {
  const userMaxFeePerGas = ethers.utils.parseUnits(userMaxFeePerGasGwei.toString(), 'gwei');
  // TODO: use AWS KMS signer
  const signer = provider.getSigner('0x87B2a7559d85f4653f13E6546A14189cd5455d45');
  const tc = new ethers.Contract(addresses.TokenController, TokenController, signer);
  const ps = new ethers.Contract(addresses.LegacyPooledStaking, LegacyPooledStaking, signer);

  const types = [
    // { name: 'ClaimsAssessment', data: require('../../v1-cla-locked-amount.json'), func: pushClaimsAssessment },
    // { name: 'StakingStake', data: require('../../v1-pooled-staking-stake.json'), func: pushV1StakingStake },
    // { name: 'StakingRewards', data: require('../../v1-pooled-staking-rewards.json'), func: pushV1StakingRewards },
    { name: 'CoverNotes', data: require('../../v1-cn-locked-amount.json'), func: pushCoverNotes },
  ];

  const progress = await loadProgress();

  for (const type of types) {
    console.log('type.name: ', type.name);
    progress[type.name] ||= { processedCount: 0 };
    const remainingData = type.data.slice(progress[type.name].processedCount);
    console.log('remainingData: ', remainingData);
    const totalData = type.data.length;
    let counter = progress[type.name].processedCount;

    while (remainingData.length > 0) {
      counter += Math.min(txPerBlock, counter - progress[type.name].processedCount);
      process.stdout.write(`\r[${type.name}] Processing members ${counter} of ${totalData}`);

      const maxFeePerGas = await getGasFees(provider, priorityFeeGwei);
      if (maxFeePerGas.gt(userMaxFeePerGas)) {
        console.log('Gas fee too high. Waiting for next block...', {
          maxFeePerGas: ethers.utils.formatUnits(maxFeePerGas, 'gwei') + ' gwei',
          userMaxFeePerGas: ethers.utils.formatUnits(userMaxFeePerGas, 'gwei') + ' gwei',
        });
        await waitFor(15000);
        continue;
      }

      const batch = remainingData.slice(0, txPerBlock);

      try {
        if (type.name === 'ClaimsAssessment') {
          await type.func({ tc, ps }, batch, type.data.length);
          progress[type.name].processedCount += batch.length;
        } else {
          const promises = batch.map(item => type.func({ tc, ps }, item));
          await Promise.all(promises);
          progress[type.name].processedCount += batch.length;
        }

        // Save progress after processing the batch
        await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
      } catch (error) {
        console.error(`Error processing ${type.name}:`, error);
        throw error; // This will stop the process
      }

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
