const { ethers } = require('hardhat');
const { addresses, Cover } = require('@nexusmutual/deployments');
const { parseUnits } = ethers;

// set/change env MAINNET_ACCOUNT_KEY and MAINNET_GAS_PRICE
// run command: HARDHAT_NETWORK=mainnet node scripts/migrate-cover-data.js

const MAX_FEE_GWEI = process.env.MAX_FEE_GWEI || '20';

async function main() {
  const signer = await ethers.getSigner();
  const cover = await ethers.getContractAt(Cover, addresses.Cover, signer);

  const totalCovers = await cover.getCoverDataCount();
  const allCoverIds = new Array(totalCovers).fill(0).map((_, i) => i + 1);

  const coversPerTx = 100;
  const gasLimit = 15000000;
  const maxFeePerGas = parseUnits(MAX_FEE_GWEI, 'gwei');
  const maxPriorityFeePerGas = parseUnits('0.5', 'gwei');

  while (allCoverIds.length > 0) {
    const coverIds = allCoverIds.splice(0, coversPerTx);
    console.log(`Migrating cover ids: ${coverIds}`);

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
