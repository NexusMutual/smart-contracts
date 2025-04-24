const { ethers } = require('hardhat');
const { AwsKmsSigner } = require('@nexusmutual/ethers-v5-aws-kms-signer');
const { addresses, Cover } = require('@nexusmutual/deployments');

const { waitForInput } = require('../lib/helpers');

const { AWS_REGION, AWS_KMS_KEY_ID } = process.env;

// set/change env MAINNET_ACCOUNT_KEY and MAINNET_GAS_PRICE
// run command: HARDHAT_NETWORK=mainnet node scripts/migrate-cover-data.js

const { MAX_FEE_GWEI = '10' } = process.env;

async function main() {
  const signer = new AwsKmsSigner(AWS_KMS_KEY_ID, AWS_REGION, ethers.provider);
  console.log('signer:', await signer.getAddress());
  const cover = await ethers.getContractAt(Cover, addresses.Cover, signer);

  const totalCovers = await cover.getCoverDataCount();
  const allCoverIds = new Array(totalCovers).fill(0).map((_, i) => i + 1);

  console.log('totalCovers', totalCovers);

  const coversPerTx = 100;
  const gasLimit = 15000000;
  const maxFeePerGas = ethers.utils.parseUnits(MAX_FEE_GWEI, 'gwei');
  const maxPriorityFeePerGas = ethers.utils.parseUnits('0.5', 'gwei');

  while (allCoverIds.length > 0) {
    const coverIds = allCoverIds.splice(0, coversPerTx);
    console.log(`Migrating cover ids: ${coverIds}`);
    await waitForInput('Press enter key to continue...');

    const overrides = { gasLimit, maxFeePerGas, maxPriorityFeePerGas };
    const tx = await cover.migrateCoverDataAndPoolAllocations(coverIds, overrides);

    console.log(`Sent tx: ${tx.hash}`);
    await tx.wait();
  }

  console.log('All covers migrated');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
