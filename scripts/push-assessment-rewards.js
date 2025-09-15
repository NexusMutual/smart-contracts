const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const { promisify } = require('node:util');

const { ethers } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');

const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');

const delay = promisify(setTimeout);

/**
 * Script to withdraw assessment rewards in behalf of users
 *
 * NOTE:
 * execute `npx hardhat run ./script/assessment-data.js --network mainnet` first to get the latest assessment data
 */

/**
 * Load assessment data from JSON file
 */
async function loadAssessmentData() {
  const filePath = path.join(process.cwd(), 'scripts', 'assessment-data.json');
  const fileContent = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(fileContent);
  console.log(`Loaded assessment data for ${Object.keys(data).length} addresses`);
  return data;
}

/**
 * Filter users who have withdrawable rewards
 */
function getUsersWithWithdrawableRewards(assessmentData) {
  const userAddresses = Object.entries(assessmentData)
    .filter(([, userData]) => {
      const withdrawableAmount = parseFloat(userData.rewards.withdrawableAmountInNXM);
      const withdrawableUntilIndex = parseInt(userData.rewards.withdrawableUntilIndex);
      return withdrawableAmount > 0 && withdrawableUntilIndex > 0;
    })
    .map(([address]) => address);

  console.log(`Found ${userAddresses.length} users with withdrawable rewards`);
  return userAddresses;
}

/**
 * Main function to push assessment rewards
 */
async function main() {
  try {
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    const signer = await getSigner(signerType);
    console.log(`Using signer type: ${signerType} (${await signer.getAddress()})`);

    const legacyAssessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment, signer);

    const assessmentData = await loadAssessmentData();
    const userWithRewards = getUsersWithWithdrawableRewards(assessmentData);

    if (userWithRewards.length === 0) {
      console.log('No users found with withdrawable rewards. Exiting.');
      return;
    }

    // ask for confirmation in mainnet
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      console.log('WARNING: You are about to send transactions on MAINNET!');
      console.log('This will push rewards for all users with withdrawable amounts.');
      console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
      await delay(10000);
    }

    for (const userAddress of userWithRewards) {
      try {
        const tx = await legacyAssessment.withdrawRewards(userAddress, 0);
        await tx.wait();
      } catch (error) {
        console.error(`Failed processing user: ${userAddress}`);
        console.error(`Error: ${error.message}\n`);
      }
    }

    // verify rewards are withdrawn
    for (const userAddress of userWithRewards) {
      const rewards = await legacyAssessment.getRewards(userAddress);
      assert(
        rewards.totalPendingAmountInNXM === 0n,
        `User ${userAddress} should have 0 but found ${rewards.totalPendingAmountInNXM} total pending rewards`,
      );
      assert(
        rewards.withdrawableAmountInNXM === 0n,
        `User ${userAddress} should have 0 but found ${rewards.withdrawableAmountInNXM} withdrawable rewards`,
      );
    }
    console.log('Successfully withdrawn assessment rewards for all users');
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
  it('push assessment rewards', async function () {
    await main.call(this);
  });
}

module.exports = { main, loadAssessmentData };
