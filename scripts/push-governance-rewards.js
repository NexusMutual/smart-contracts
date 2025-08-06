const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');
const { addresses, Governance } = require('@nexusmutual/deployments');

/**
 * Load governance rewards data from JSON file
 */
async function loadGovernanceRewards() {
  try {
    const filePath = path.join(__dirname, '../', 'gov-rewards.json');
    const fileContent = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(fileContent);

    console.log(`Loaded governance rewards for ${Object.keys(data).length} addresses`);
    return data;
  } catch (error) {
    throw new Error(`Failed to load governance rewards data: ${error.message}`);
  }
}

/**
 * Filter users who have governance rewards
 * @param {Object} governanceRewards - Governance rewards data object
 */
function getUsersWithGovernanceRewards(governanceRewards) {
  const usersWithRewards = [];

  for (const [userAddress, rewardAmount] of Object.entries(governanceRewards)) {
    const amount = parseFloat(rewardAmount);

    if (amount > 0) {
      usersWithRewards.push({
        address: userAddress,
        rewardAmount: amount,
      });
    }
  }

  console.log(`Found ${usersWithRewards.length} users with governance rewards`);
  return usersWithRewards;
}

/**
 * Claim governance rewards for a single user
 * @param {Object} governanceContract - Governance contract instance
 * @param {string} userAddress - User address
 * @param {number} maxRecords - Maximum number of records to process
 */
async function claimRewardsForUser(governanceContract, userAddress, maxRecords = 100) {
  try {
    console.log(`Claiming governance rewards for ${userAddress}...`);
    console.log(`  Processing up to ${maxRecords} records`);

    // Estimate gas first
    let gasEstimate;
    try {
      gasEstimate = await governanceContract.claimReward.estimateGas(userAddress, maxRecords);
      console.log(`  Gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
      gasEstimate = 400000n; // Fallback gas limit
      console.log(`  Gas estimation failed, using fallback: ${gasEstimate.toString()}`);
      console.log(`  Estimation error: ${error.message}`);
    }

    // Execute the transaction - claim governance rewards
    const tx = await governanceContract.claimReward(userAddress, maxRecords, {
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
    console.error(`  Failed to claim rewards for ${userAddress}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main function to push governance rewards
 */
async function main() {
  try {
    console.log('Starting governance rewards push process...\n');

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
        console.info('Snapshot ID: ', await ethers.provider.send('evm_snapshot'));
      }
    }

    // Get signer
    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    console.log(`Using signer type: ${signerType}`);
    const signer = await getSigner(signerType);
    const signerAddress = await signer.getAddress();
    console.log(`Signer address: ${signerAddress}`);

    // Initialize Governance contract
    const governanceContract = await ethers.getContractAt([...Governance], addresses.Governance, signer);
    console.log(`Governance contract initialized: ${addresses.Governance}\n`);

    // Load governance rewards data
    const governanceRewards = await loadGovernanceRewards();

    // Filter users with governance rewards
    const usersWithRewards = getUsersWithGovernanceRewards(governanceRewards);

    if (usersWithRewards.length === 0) {
      console.log('No users found with governance rewards. Exiting.');
      return;
    }

    // Show summary before processing
    const totalRewardAmount = usersWithRewards.reduce((sum, user) => sum + user.rewardAmount, 0);
    console.log(`Summary:`);
    console.log(`- Users to process: ${usersWithRewards.length}`);
    console.log(`- Total reward amount: ${totalRewardAmount.toFixed(6)} NXM\n`);

    // Ask for confirmation in production
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      // Mainnet
      console.log('⚠️  WARNING: You are about to send transactions on MAINNET!');
      console.log('This will claim governance rewards for all users.');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Process each user
    console.log('Processing users...\n');
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < usersWithRewards.length; i++) {
      const user = usersWithRewards[i];
      const userNumber = i + 1;

      console.log(`Processing user ${userNumber}/${usersWithRewards.length}: ${user.address}`);
      console.log(`  Expected reward amount: ${user.rewardAmount} NXM`);

      // Use a reasonable max records value - can be adjusted based on needs
      const maxRecords = 100;

      const result = await claimRewardsForUser(governanceContract, user.address, maxRecords);

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
    console.log(`Total expected reward amount: ${totalRewardAmount.toFixed(6)} NXM`);

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
