const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');

const ASSESSMENT_ADDRESS = '0xcafeaa5f9c401b7295890f309168Bbb8173690A3';
const ASSESSMENT_ABI = [
  'function withdrawRewards(address user, uint104 batchSize) external ' +
    'returns (uint withdrawn, uint withdrawnUntilIndex)',
];

/**
 * Load assessment data from JSON file
 */
async function loadAssessmentData() {
  try {
    const filePath = path.join(__dirname, 'assessment-data.json');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    console.log(`Loaded assessment data for ${Object.keys(data).length} addresses`);
    return data;
  } catch (error) {
    throw new Error(`Failed to load assessment data: ${error.message}`);
  }
}

/**
 * Filter users who have withdrawable rewards
 * @param {Object} assessmentData - Assessment data object
 */
function getUsersWithWithdrawableRewards(assessmentData) {
  const usersWithRewards = [];

  for (const [userAddress, userData] of Object.entries(assessmentData)) {
    const withdrawableAmount = parseFloat(userData.rewards.withdrawableAmountInNXM);
    const withdrawableUntilIndex = parseInt(userData.rewards.withdrawableUntilIndex);

    if (withdrawableAmount > 0 && withdrawableUntilIndex > 0) {
      usersWithRewards.push({
        address: userAddress,
        withdrawableAmount,
        withdrawableUntilIndex,
        totalPendingAmount: parseFloat(userData.rewards.totalPendingAmountInNXM),
      });
    }
  }

  console.log(`Found ${usersWithRewards.length} users with withdrawable rewards`);
  return usersWithRewards;
}

/**
 * Push rewards for a single user
 * @param {Object} assessmentContract - Assessment contract instance
 * @param {string} userAddress - User address
 * @param {number} withdrawableUntilIndex - Number of assessment batches to withdraw
 */
async function pushRewardsForUser(assessmentContract, userAddress, withdrawableUntilIndex) {
  try {
    console.log(`Pushing rewards for ${userAddress}...`);
    console.log(`  Withdrawing from ${withdrawableUntilIndex} assessment batches`);

    // Estimate gas first
    let gasEstimate;
    try {
      gasEstimate = await assessmentContract.withdrawRewards.estimateGas(userAddress, withdrawableUntilIndex);
      console.log(`  Gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
      gasEstimate = 400000n; // Fallback gas limit
      console.log(`  Gas estimation failed, using fallback: ${gasEstimate.toString()}`);
      console.log(`  Estimation error: ${error.message}`);
    }

    // Execute the transaction - withdraw all available rewards
    const tx = await assessmentContract.withdrawRewards(userAddress, withdrawableUntilIndex, {
      gasLimit: (gasEstimate * 110n) / 100n, // Add 10% buffer
    });

    console.log(`  Transaction sent: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(`  Transaction confirmed in block ${receipt.blockNumber}`);
    console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

    return {
      success: true,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  } catch (error) {
    console.error(`  Failed to push rewards for ${userAddress}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main function to push assessment rewards
 */
async function main() {
  try {
    console.log('Starting assessment rewards push process...\n');

    // Get network info
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    // Handle Tenderly snapshot revert
    if (network.name === 'tenderly') {
      const { TENDERLY_SNAPSHOT_ID } = process.env;
      if (TENDERLY_SNAPSHOT_ID) {
        await ethers.provider.send('evm_revert', [TENDERLY_SNAPSHOT_ID]);
        console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
      } else {
        const snapshotId = await ethers.provider.send('evm_snapshot', []);
        console.info('Snapshot ID: ', snapshotId);
      }
    }

    // Get signer
    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    console.log(`Using signer type: ${signerType}`);
    const signer = await getSigner(signerType);
    const signerAddress = await signer.getAddress();
    console.log(`Signer address: ${signerAddress}`);

    // Initialize Assessment contract
    const assessmentContract = new ethers.Contract(ASSESSMENT_ADDRESS, ASSESSMENT_ABI, signer);
    console.log(`Assessment contract initialized: ${ASSESSMENT_ADDRESS}\n`);

    // Load assessment data
    const assessmentData = await loadAssessmentData();

    // Filter users with withdrawable rewards
    const usersWithRewards = getUsersWithWithdrawableRewards(assessmentData);

    if (usersWithRewards.length === 0) {
      console.log('No users found with withdrawable rewards. Exiting.');
      return;
    }

    // Show summary before processing
    const totalWithdrawableAmount = usersWithRewards.reduce((sum, user) => sum + user.withdrawableAmount, 0);
    console.log(`Summary:`);
    console.log(`- Users to process: ${usersWithRewards.length}`);
    console.log(`- Total withdrawable amount: ${totalWithdrawableAmount.toFixed(6)} NXM\n`);

    // Ask for confirmation in production
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      // Mainnet
      console.log('⚠️  WARNING: You are about to send transactions on MAINNET!');
      console.log('This will push rewards for all users with withdrawable amounts.');
      console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Process each user
    console.log('Processing users...\n');
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < usersWithRewards.length; i++) {
      const user = usersWithRewards[i];
      const userNumber = i + 1;

      console.log(`Processing user ${userNumber}/${usersWithRewards.length}: ${user.address}`);
      console.log(`  Withdrawable amount: ${user.withdrawableAmount} NXM`);
      console.log(`  Withdrawable until index: ${user.withdrawableUntilIndex}`);

      const result = await pushRewardsForUser(assessmentContract, user.address, user.withdrawableUntilIndex);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      console.log(''); // Add spacing between users
    }

    // Final summary
    console.log(`=== FINAL SUMMARY ===`);
    console.log(`Total users processed: ${usersWithRewards.length}`);
    console.log(`Successful transactions: ${successCount}`);
    console.log(`Failed transactions: ${errorCount}`);
    console.log(`Total withdrawable amount: ${totalWithdrawableAmount.toFixed(6)} NXM`);

    if (errorCount > 0) {
      console.log(`\n⚠️  Some transactions failed. Check the console output for details.`);
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
