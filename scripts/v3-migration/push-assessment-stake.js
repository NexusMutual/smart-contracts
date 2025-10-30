const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ethers, nexus } = require('hardhat');
const { addresses } = require('@nexusmutual/deployments');

const { waitForInput } = nexus.helpers;

const USE_AWS_KMS = process.env.SIGNER_TYPE === 'aws-kms';

/// Script to withdraw assessment stake on behalf of users
/// Note: execute `npx hardhat run ./script/v3-migration/03-get-assessment-data.js --network mainnet` first

const pushStake = async signer => {
  const legacyAssessment = await ethers.getContractAt('LegacyAssessment', addresses.Assessment, signer);

  const infile = path.join(__dirname, 'data/assessment-data.json');
  const usersWithStake = JSON.parse(fs.readFileSync(infile, 'utf8'))
    .filter(({ stake }) => stake !== '0')
    .map(({ address }) => address);

  console.log('Unstaking assessment stakes for users...\n', usersWithStake.join(', '));

  const tx = await legacyAssessment.unstakeAllForBatch(usersWithStake);
  await tx.wait();

  // verify stakes are unstaked
  for (const user of usersWithStake) {
    const stake = await legacyAssessment.stakeOf(user);
    assert(stake.amount === 0n, `User ${user} should have 0 stake after unstaking`);
  }
};

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

  const [signer] = USE_AWS_KMS ? [nexus.awsKms.getSigner(ethers.provider)] : await ethers.getSigners();
  console.log(`Using signer type: ${USE_AWS_KMS ? 'AWS KMS' : 'local'} (${await signer.getAddress()})`);

  await waitForInput(`Going to send transactions on ${network.name} - press enter to continue...`);
  await pushStake(signer);

  console.log('Successfully pushed assessment stake for all users');
}

module.exports = { pushStake };

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
  it('push assessment stakes', async function () {
    const [signer] = await ethers.getSigners();
    await pushStake(signer);
  });
}
