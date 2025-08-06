const { ethers } = require('hardhat');
const fs = require('node:fs').promises;
const path = require('node:path');
const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');

const TOKEN_CONTROLLER_ADDRESS = ''; // TODO: Add TokenController address
const TOKEN_CONTROLLER_ABI = ['function unstakeAssessmentFor(address member) external'];

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
 * Filter users who have assessment stakes
 */
function getUsersWithStake(assessmentData) {
  const usersWithStake = Object.entries(assessmentData)
    .filter(([_, userData]) => parseFloat(userData.stake.amount) > 0)
    .map(([address, userData]) => ({
      address,
      stakeAmount: parseFloat(userData.stake.amount),
      fraudCount: parseInt(userData.stake.fraudCount),
    }));

  console.log(`Found ${usersWithStake.length} users with assessment stakes`);
  return usersWithStake;
}

/**
 * Unstake assessment for a single user
 * @param {Object} tokenControllerContract - TokenController contract instance
 * @param {string} userAddress - User address
 */
async function unstakeAssessmentForUser(tokenControllerContract, userAddress) {
  try {
    console.log(`Unstaking assessment for ${userAddress}...`);

    // Estimate gas first
    let gasEstimate;
    try {
      gasEstimate = await tokenControllerContract.unstakeAssessmentFor.estimateGas(userAddress);
      console.log(`  Gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
      gasEstimate = 400000n; // Fallback gas limit
      console.log(`  Gas estimation failed, using fallback: ${gasEstimate.toString()}`);
      console.log(`  Estimation error: ${error.message}`);
    }

    // Execute the transaction - unstake all assessment stake
    const tx = await tokenControllerContract.unstakeAssessmentFor(userAddress, {
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
    console.error(`  Failed to unstake assessment for ${userAddress}:`, error.message);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Main function to push assessment stakes
 */
async function main() {
  try {
    console.log('Starting assessment stakes push process...\n');

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

    // Check if TokenController address is set
    if (!TOKEN_CONTROLLER_ADDRESS) {
      throw new Error('TOKEN_CONTROLLER_ADDRESS is not set. Please add the TokenController address.');
    }

    // Get signer
    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    console.log(`Using signer type: ${signerType}`);
    const signer = await getSigner(signerType);
    const signerAddress = await signer.getAddress();
    console.log(`Signer address: ${signerAddress}`);

    // Initialize TokenController contract
    const tokenControllerContract = new ethers.Contract(TOKEN_CONTROLLER_ADDRESS, TOKEN_CONTROLLER_ABI, signer);
    console.log(`TokenController contract initialized: ${TOKEN_CONTROLLER_ADDRESS}\n`);

    // Load assessment data
    const assessmentData = await loadAssessmentData();

    // Filter users with stakes
    const usersWithStake = getUsersWithStake(assessmentData);

    if (usersWithStake.length === 0) {
      console.log('No users found with assessment stakes. Exiting.');
      return;
    }

    // Show summary before processing
    const totalStakeAmount = usersWithStake.reduce((sum, user) => sum + user.stakeAmount, 0);
    console.log(`Summary:`);
    console.log(`- Users to process: ${usersWithStake.length}`);
    console.log(`- Total stake amount: ${totalStakeAmount.toFixed(6)} NXM\n`);

    // Ask for confirmation in production
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      // Mainnet
      console.log('⚠️  WARNING: You are about to send transactions on MAINNET!');
      console.log('This will unstake assessment stakes for all users.');
      console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Process each user
    console.log('Processing users...\n');
    let successCount = 0;
    let errorCount = 0;

    for (const [index, user] of usersWithStake.entries()) {
      console.log(`Processing user ${index + 1}/${usersWithStake.length}: ${user.address} (${user.stakeAmount} NXM)`);

      const result = await unstakeAssessmentForUser(tokenControllerContract, user.address);

      if (result.success) {
        successCount++;
      } else {
        errorCount++;
      }

      console.log(''); // Add spacing between users
    }

    // Final summary
    console.log(`=== FINAL SUMMARY ===`);
    console.log(`Total users processed: ${usersWithStake.length}`);
    console.log(`Successful transactions: ${successCount}`);
    console.log(`Failed transactions: ${errorCount}`);
    console.log(`Total stake amount: ${totalStakeAmount.toFixed(6)} NXM`);

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
