require('dotenv').config();
const fs = require('node:fs/promises');
const util = require('node:util');

const deployments = require('@nexusmutual/deployments');
const { ethers } = require('ethers');

const { pushCoverNotes, pushClaimsAssessment, pushV1StakingStake, pushV1StakingRewards } = require('./v1-nxm-push');

const PROGRESS_FILE = 'v1-nxm-progress.json';

const waitFor = util.promisify(setTimeout);

const getContract = (contractName, signer) => {
  const abi = deployments[contractName];
  const address = deployments.addresses[contractName];
  if (!abi || !address) {
    throw new Error(`address or abi not found for ${contractName} contract`);
  }
  return new ethers.Contract(address, abi, signer);
};

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

/**
 * Processes V1 NXM push tokens for different types (ClaimsAssessment, StakingStake, StakingRewards, CoverNotes).
 *
 * @param {ethers.providers.JsonRpcProvider} provider - Ethereum provider
 * @param {number} userMaxFeePerGasGwei - Maximum gas fee user is willing to pay (in Gwei)
 * @param {number} priorityFeeGwei - Priority fee (in Gwei)
 * @param {number} txPerBlock - Number of transactions to process per block
 *
 * Features:
 * - Only executes txs within the gas fee limit set by the user
 * - Batches transactions for efficiency
 * - Tracks progress and allows resuming from last processed item (in case of any tx errors)
 */
async function processV1NXM(provider, userMaxFeePerGasGwei, priorityFeeGwei, txPerBlock) {
  const userMaxFeePerGas = ethers.utils.parseUnits(userMaxFeePerGasGwei.toString(), 'gwei');
  const signer = new ethers.Wallet(process.env.WALLET_PK, provider);
  const tc = getContract('TokenController', signer);
  const ps = getContract('LegacyPooledStaking', signer);

  const types = [
    { name: 'ClaimsAssessment', data: require('../../v1-cla-locked-amount.json'), func: pushClaimsAssessment },
    { name: 'StakingStake', data: require('../../v1-pooled-staking-stake.json'), func: pushV1StakingStake },
    { name: 'StakingRewards', data: require('../../v1-pooled-staking-rewards.json'), func: pushV1StakingRewards },
    { name: 'CoverNotes', data: require('../../v1-cn-locked-amount.json'), func: pushCoverNotes },
  ];

  const progress = await loadProgress();

  for (const type of types) {
    progress[type.name] ||= { processedCount: 0 };

    let counter = progress[type.name].processedCount;
    const totalData = type.data.length;
    const remainingData = type.data.slice(progress[type.name].processedCount);

    while (remainingData.length > 0) {
      counter += txPerBlock;
      process.stdout.write(`\r[${type.name}] Processing members ${counter} of ${totalData}`);

      const maxFeePerGas = await getGasFees(provider, priorityFeeGwei);
      if (maxFeePerGas.gt(userMaxFeePerGas)) {
        console.log(
          'Gas fee too high. Waiting for next block...',
          `maxFeePerGas: ${ethers.utils.formatUnits(maxFeePerGas, 'gwei')} gwei`,
          `userMaxFeePerGas: ${ethers.utils.formatUnits(userMaxFeePerGas, 'gwei')} gwei`,
        );
        await waitFor(15000); // ~15s average block time
        continue;
      }

      const batch = remainingData.slice(0, txPerBlock);

      try {
        if (type.name === 'ClaimsAssessment') {
          await type.func({ tc, ps }, batch);
        } else {
          const promises = batch.map(item => type.func({ tc, ps }, item));
          await Promise.all(promises);
        }
      } catch (error) {
        console.error(`Error processing ${type.name}:`, error);
        throw error; // This will stop the process
      }

      // Save progress after processing the batch
      progress[type.name].processedCount += batch.length;
      await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));

      remainingData.splice(0, txPerBlock);
    }

    console.log(`Successfully pushed all v1 NXM ${type.name}`);
  }

  console.log('All v1 NXM types processed successfully.');
}

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
