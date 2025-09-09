const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const { promisify } = require('node:util');

const { addresses } = require('@nexusmutual/deployments');
const { ethers } = require('hardhat');

const { getSigner, SIGNER_TYPE } = require('./create2/get-signer');

const delay = promisify(setTimeout);

/**
 * Script to unstake assessment stakes in behalf of users
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
 * Filter users who have assessment stakes
 */
function getUsersWithStake(assessmentData) {
  const usersWithStake = Object.entries(assessmentData)
    .filter(([, userData]) => parseFloat(userData.stake.amount) > 0)
    .map(([address]) => address);

  console.log(`Found ${usersWithStake.length} users with assessment stakes`);
  return usersWithStake;
}

/**
 * Main function to push assessment stakes
 */
async function main() {
  try {
    const network = await ethers.provider.getNetwork();
    console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

    const signerType = process.env.SIGNER_TYPE || SIGNER_TYPE.LOCAL;
    const signer = await getSigner(signerType);
    console.log(`Using signer type: ${signerType} (${await signer.getAddress()})`);

    const legacyAssessment = await ethers.getContractAt('LegacyAssessment', addresses.Assessment, signer);

    const assessmentData = await loadAssessmentData();
    const usersWithStake = getUsersWithStake(assessmentData);

    if (usersWithStake.length === 0) {
      console.log('No users found with assessment stakes. Exiting.');
      return;
    }

    // ask for confirmation in mainnet
    if (Number(network.chainId) === 1 && network.name !== 'tenderly') {
      console.log('WARNING: You are about to send transactions on MAINNET!');
      console.log('This will unstake assessment stakes for all users.');
      console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
      await delay(10000);
    }

    console.log('Unstaking assessment stakes for users...\n', usersWithStake.join(', '));

    const tx = await legacyAssessment.unstakeAllForBatch(usersWithStake);
    await tx.wait();

    // verify stakes are unstaked
    for (const user of usersWithStake) {
      const stake = await legacyAssessment.stakeOf(user);
      assert(stake.amount === 0n, `User ${user} should have 0 stake after unstaking`);
    }

    console.log('Successfully unstaked assessment for all users');
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
  it('push assessment stakes', async function () {
    await main.call(this);
  });
}

module.exports = { main, loadAssessmentData };
