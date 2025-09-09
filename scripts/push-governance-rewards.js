const fs = require('node:fs').promises;
const path = require('node:path');
const { promisify } = require('node:util');

const { addresses, abis } = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');

const delay = promisify(setTimeout);

/**
 * Script to claim governance rewards in behalf of users
 *
 * NOTE:
 * execute `npx hardhat run ./script/gov-rewards.js --network mainnet` first to get the latest governance rewards data
 */

/**
 * Load governance rewards data from JSON file
 */
async function loadGovernanceRewards() {
  const filePath = path.join(process.cwd(), 'scripts', 'gov-rewards.json');
  const fileContent = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContent);
  console.log(`Loaded governance rewards for ${Object.keys(data).length} addresses`);
  return data;
}

/**
 * Filter users who have governance rewards
 * @param {Object} governanceRewards - Governance rewards data object
 */
function getUsersWithGovernanceRewards(governanceRewards) {
  const usersWithRewards = Object.entries(governanceRewards)
    .map(([userAddress, rewardAmount]) => ({
      address: userAddress,
      rewardAmount: parseFloat(rewardAmount),
    }))
    .filter(user => user.rewardAmount > 0);

  console.log(`Found ${usersWithRewards.length} users with governance rewards`);
  return usersWithRewards;
}

/**
 * Main function to push governance rewards
 */
async function main() {
  try {
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    const signer = await getSigner(signerType);
    console.log(`Using signer type: ${signerType} (${await signer.getAddress()})`);

    const tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController, signer);

    const governanceRewards = await loadGovernanceRewards();
    const usersWithRewards = getUsersWithGovernanceRewards(governanceRewards);

    if (usersWithRewards.length === 0) {
      console.log('No users found with governance rewards. Exiting.');
      return;
    }

    // ask for confirmation in mainnet
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      console.log('WARNING: You are about to send transactions on MAINNET!');
      console.log('This will claim governance rewards for all users.');
      console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
      await delay(10000);
    }

    let successCount = 0;
    let errorCount = 0;
    const maxRecords = 100;
    const failedAddresses = [];

    for (let i = 0; i < usersWithRewards.length; i++) {
      console.log(`Processing user... ${i + 1}/${usersWithRewards.length}`);
      const user = usersWithRewards[i];
      const userNumber = i + 1;

      try {
        const tx = await tokenController.withdrawGovernanceRewards(user.address, maxRecords);
        await tx.wait();
        successCount++;
      } catch (error) {
        console.error(`Failed processing user ${userNumber}/${usersWithRewards.length}: ${user.address}`);
        console.error(`Error: ${error.message}\n`);
        errorCount++;
        failedAddresses.push(user.address);
      }
    }

    console.log(`=== FINAL SUMMARY ===`);
    console.log(`Total users processed: ${usersWithRewards.length}`);
    console.log(`Successful transactions: ${successCount}`);
    console.log(`Failed transactions: ${errorCount}`);

    if (errorCount > 0) {
      console.log(`\nFailed addresses to retry:`);
      failedAddresses.forEach((address, index) => {
        console.log(`${index + 1}. ${address}`);
      });
      console.log(`\nFailed addresses (comma-separated): ${failedAddresses.join(', ')}`);
    }
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  }
}

// run the script
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

// run the script via test
if (require.main !== module && typeof it !== 'undefined') {
  it('push legacy governance rewards', async function () {
    await main.call(this);
  });
}

module.exports = { main, loadGovernanceRewards };
