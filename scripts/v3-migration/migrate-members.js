const { ethers, nexus } = require('hardhat');
const addresses = require('@nexusmutual/deployments').addresses;

const { waitForInput } = nexus.helpers;

const USE_AWS_KMS = process.env.SIGNER_TYPE === 'aws-kms';

async function main() {
  const network = await ethers.provider.getNetwork();
  console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);

  const [signer] = USE_AWS_KMS ? [nexus.awsKms.getSigner(ethers.provider)] : await ethers.getSigners();
  const memberRoles = await ethers.getContractAt('LegacyMemberRoles', addresses.MemberRoles, signer);
  console.log(`Using signer type: ${USE_AWS_KMS ? 'AWS KMS' : 'local'} (${await signer.getAddress()})`);

  await waitForInput(`Going to send transactions on ${network.name} - press enter to continue...`);

  const baseFee = ethers.parseUnits('10', 'gwei');
  const maxPriorityFeePerGas = ethers.parseUnits('0.5', 'gwei');
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  let finishedMigrating = await memberRoles.hasFinishedMigrating();

  while (!finishedMigrating) {
    console.log('calling memberRoles.migrateMembers(500)');

    const migrateMembersTx = await memberRoles.migrateMembers(500, { maxFeePerGas, maxPriorityFeePerGas });
    console.log(`Sent tx: ${migrateMembersTx.hash}`);

    await migrateMembersTx.wait();
    finishedMigrating = await memberRoles.hasFinishedMigrating();
  }

  console.log('Successfully migrated members');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
