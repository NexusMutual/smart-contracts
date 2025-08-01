const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { inspect } = require('node:util');
const { addresses, Assessment } = require('@nexusmutual/deployments');

const { formatEther } = ethers;

/**
 * Find the most recent member addresses file
 */
async function findMemberAddressesFile() {
  try {
    const files = await fs.readdir(__dirname);
    const memberAddressFiles = files.filter(
      file => file.startsWith('member-roles-addresses-role-all') && file.endsWith('.json'),
    );

    if (memberAddressFiles.length === 0) {
      throw new Error('No member addresses file found. Run member-roles-addresses.js first.');
    }

    // Since there's only one file per role combination, just take the first (and only) one
    const memberAddressFile = memberAddressFiles[0];
    const fullPath = path.join(__dirname, memberAddressFile);

    console.log(`Using member addresses from: ${memberAddressFile}`);
    return fullPath;
  } catch (error) {
    throw new Error(`Failed to find member addresses file: ${error.message}`);
  }
}

/**
 * Load member addresses from JSON file
 */
async function loadMemberAddresses() {
  const filePath = await findMemberAddressesFile();
  const fileContent = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContent);

  console.log(`Loaded ${data.totalAddresses} addresses extracted at ${data.extractedAt}`);
  console.log(`Role IDs: ${data.roleIds.join(', ')}`);

  return data.addresses;
}

/**
 * Batch process addresses
 * @param {Array} addresses - Array of addresses to process
 * @param {Function} processFn - Function to process each batch
 * @param {number} batchSize - Size of each batch
 */
async function processBatches(addresses, processFn, batchSize = 100) {
  const results = [];
  const allFailedAddresses = [];

  for (let i = 0; i < addresses.length; i += batchSize) {
    const batch = addresses.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(addresses.length / batchSize);
    console.log(`Processing batch ${batchNumber}/${totalBatches} (${batch.length} addresses)`);

    const batchResult = await processFn(batch);

    if (batchResult.success) {
      results.push(...batchResult.data);
      // Add any individual failures within the batch
      if (batchResult.failedAddresses.length > 0) {
        allFailedAddresses.push(...batchResult.failedAddresses);
      }
    } else {
      const failedCount = batchResult.failedAddresses.length;
      console.error(`Batch ${batchNumber} failed, adding ${failedCount} addresses to retry list`);
      allFailedAddresses.push(...batchResult.failedAddresses);
    }

    // Small delay to be nice to the RPC provider
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { results, failedAddresses: allFailedAddresses };
}

/**
 * Process a batch of addresses to get their stake and rewards data
 * @param {Array} addressBatch - Batch of addresses to process
 * @param {Object} assessmentContract - Assessment contract instance
 */
async function processBatch(addressBatch, assessmentContract) {
  const individualFailedAddresses = [];

  try {
    const stakeResults = await Promise.allSettled(
      addressBatch.map(address => {
        try {
          return assessmentContract.stakeOf(address);
        } catch (error) {
          console.warn(`Failed to get stake for ${address}:`, error.message);
          individualFailedAddresses.push(address);
          return { amount: 0, rewardsWithdrawableFromIndex: 0, fraudCount: 0 };
        }
      }),
    );

    const rewardsResults = await Promise.allSettled(
      addressBatch.map(address => {
        try {
          return assessmentContract.getRewards(address);
        } catch (error) {
          console.warn(`Failed to get rewards for ${address}:`, error.message);
          if (!individualFailedAddresses.includes(address)) {
            individualFailedAddresses.push(address);
          }
          return { totalPendingAmount: 0, withdrawableAmount: 0, withdrawableUntilIndex: 0 };
        }
      }),
    );

    // Process results and filter for non-zero values
    const batchData = [];

    for (let i = 0; i < addressBatch.length; i++) {
      const address = addressBatch[i];

      const stakeResult = stakeResults[i];
      const rewardsResult = rewardsResults[i];

      if (stakeResult.status === 'rejected' || rewardsResult.status === 'rejected') {
        if (!individualFailedAddresses.includes(address)) {
          individualFailedAddresses.push(address);
        }
        continue;
      }

      const stake = stakeResult.value;
      const rewards = rewardsResult.value;

      // Check if address has any non-zero stake or rewards
      const hasStake = stake.amount > 0;
      const hasRewards = rewards.totalPendingAmount > 0 || rewards.withdrawableAmount > 0;

      if (hasStake || hasRewards) {
        console.log('has stake or rewards: ', address);
        batchData.push({
          address,
          stake: {
            amount: formatEther(stake.amount),
            rewardsWithdrawableFromIndex: stake.rewardsWithdrawableFromIndex?.toString(),
            fraudCount: stake.fraudCount?.toString(),
          },
          rewards: {
            totalPendingAmountInNXM: formatEther(rewards.totalPendingAmountInNXM),
            withdrawableAmountInNXM: formatEther(rewards.withdrawableAmountInNXM),
            withdrawableUntilIndex: rewards.withdrawableUntilIndex?.toString(),
          },
        });
      }
    }

    if (individualFailedAddresses.length > 0) {
      console.warn(`  Individual failures in batch: ${individualFailedAddresses.length} addresses`);
    }

    return { success: true, data: batchData, failedAddresses: individualFailedAddresses };
  } catch (error) {
    console.error(`Entire batch failed:`, error.message);
    console.error(`  Batch contained addresses: ${addressBatch.join(', ')}`);
    // Return all addresses in the batch as failed since we couldn't process any of them
    return { success: false, data: [], failedAddresses: addressBatch };
  }
}

/**
 * Main function to extract assessment data
 */
async function main() {
  try {
    console.log('Using hardhat provider...');
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    // Initialize Assessment contract
    const assessmentContract = await ethers.getContractAt([...Assessment], addresses.Assessment);
    console.log('Assessment contract initialized:', addresses.Assessment);

    // Load member addresses from file
    const memberAddresses = await loadMemberAddresses();

    if (memberAddresses.length === 0) {
      console.log('No member addresses found in file');
      return;
    }

    console.log(`\nProcessing ${memberAddresses.length} addresses...`);

    // Process addresses in batches
    const { results, failedAddresses } = await processBatches(
      memberAddresses,
      batch => processBatch(batch, assessmentContract),
      25, // Reduced batch size to avoid RPC timeouts
    );

    console.log(`\nFound ${results.length} addresses with non-zero stake or rewards`);

    // Convert array to object format as specified in pseudo code
    const result = {};
    results.forEach(data => {
      result[data.address] = {
        stake: data.stake,
        rewards: data.rewards,
      };
    });

    // Save to JSON file
    const outputPath = path.join(__dirname, 'assessment-data.json');
    await fs.writeFile(outputPath, JSON.stringify(result, null, 2));

    console.log(`\nData saved to: ${outputPath}`);
    console.log(`Total addresses with data: ${Object.keys(result).length}`);

    console.log('Failed addresses: ', inspect(failedAddresses, { depth: null }));
    console.log('Results: ', inspect(Object.keys(result), { depth: null }));

    if (failedAddresses.length > 0) {
      const failedOutputPath = path.join(__dirname, 'failed-addresses.json');
      await fs.writeFile(failedOutputPath, JSON.stringify(failedAddresses, null, 2));
      console.log(`\nFailed addresses saved to: ${failedOutputPath}`);
      console.log(`Total failed addresses: ${failedAddresses.length}`);
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main()
    .then(() => {
      console.log('\nScript completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

module.exports = { main };
