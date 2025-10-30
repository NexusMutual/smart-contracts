const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');
const { abis, addresses } = require('@nexusmutual/deployments');

const { waitForInput } = nexus.helpers;

const USE_AWS_KMS = process.env.SIGNER_TYPE === 'aws-kms';

/// Script to withdraw assessment rewards on behalf of users
/// Note: execute `npx hardhat run ./script/v3-migration/03-get-assessment-data.js --network mainnet` first

const pushRewards = async signer => {
  const infile = path.join(__dirname, 'data/assessment-data.json');
  const userWithRewards = JSON.parse(fs.readFileSync(infile, 'utf8'))
    .filter(({ rewards }) => rewards !== '0')
    .map(({ address }) => address);

  const legacyAssessment = await ethers.getContractAt(abis.Assessment, addresses.Assessment, signer);

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
};

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

  const [signer] = USE_AWS_KMS ? [nexus.awsKms.getSigner(ethers.provider)] : await ethers.getSigners();
  console.log(`Using signer type: ${USE_AWS_KMS ? 'AWS KMS' : 'local'} (${await signer.getAddress()})`);

  await waitForInput(`Going to send transactions on ${network.name} - press enter to continue...`);
  await pushRewards(signer);

  console.log('Successfully withdrawn assessment rewards for all users');
}

module.exports = { pushRewards };

// run the script
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Unhandled error:', error);
      process.exit(1);
    });
}

// run the script via test
if (require.main !== module && typeof it !== 'undefined') {
  it('push assessment rewards', async function () {
    const [signer] = await ethers.getSigners();
    await pushRewards(signer);
  });
}
