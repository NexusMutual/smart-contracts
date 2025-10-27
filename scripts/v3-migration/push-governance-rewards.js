const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');
const { addresses, abis } = require('@nexusmutual/deployments');

const { waitForInput } = nexus.helpers;

const USE_AWS_KMS = process.env.SIGNER_TYPE === 'aws-kms';

// Script to claim governance rewards in behalf of users
// Note: execute `npx hardhat run ./script/v3-migration/02-get-gov-rewards.js --network mainnet` first

const pushGovernanceRewards = async signer => {
  const tokenController = await ethers.getContractAt(abis.TokenController, addresses.TokenController, signer);

  const infile = path.join(__dirname, 'data/gov-rewards.json');
  const usersWithRewards = JSON.parse(fs.readFileSync(infile, 'utf8'))
    .filter(({ reward }) => reward !== '0')
    .map(({ address }) => address);

  let successCount = 0;
  let errorCount = 0;
  const maxRecords = 100;
  const failedAddresses = [];

  for (let i = 0; i < usersWithRewards.length; i++) {
    process.stdout.write(`\rPushing governance rewards ${i + 1}/${usersWithRewards.length}`);
    const user = usersWithRewards[i];

    try {
      const tx = await tokenController.withdrawGovernanceRewards(user, maxRecords);
      await tx.wait();
      successCount++;
    } catch (error) {
      console.error(`Failed processing user ${i + 1}/${usersWithRewards.length}: ${user}`);
      console.error(`Error: ${error.message}\n`);
      errorCount++;
      failedAddresses.push(user);
    }
  }

  console.log(`\n=== FINAL SUMMARY ===`);
  console.log(`Total users processed: ${usersWithRewards.length}`);
  console.log(`Successful transactions: ${successCount}`);
  console.log(`Failed transactions: ${errorCount}`);

  if (errorCount > 0) {
    console.log(`\nFailed addresses to retry:`);
    failedAddresses.forEach((address, index) => {
      console.log(`${index + 1}. ${address}`);
    });
  }
};

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

  const [signer] = USE_AWS_KMS ? [nexus.awsKms.getSigner(ethers.provider)] : await ethers.getSigners();
  console.log(`Using signer type: ${USE_AWS_KMS ? 'AWS KMS' : 'local'} (${await signer.getAddress()})`);

  await waitForInput(`Going to send transactions on ${network.name} - press enter to continue...`);
  await pushGovernanceRewards(signer);

  console.log('Successfully pushed governance rewards for all users');
}

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
  it('push legacy governance rewards', async function () {
    const [signer] = await ethers.getSigners();
    await pushGovernanceRewards(signer);
  });
}

module.exports = { main, pushGovernanceRewards };
