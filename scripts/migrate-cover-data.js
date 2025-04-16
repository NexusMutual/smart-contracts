const { ethers } = require('hardhat');
const { addresses, Cover } = require('@nexusmutual/deployments');

// set/change env MAINNET_ACCOUNT_KEY and MAINNET_GAS_PRICE
// run command: HARDHAT_NETWORK=mainnet node scripts/migrate-cover-data.js

async function main() {
  const cover = await ethers.getContractAt(Cover, addresses.Cover);
  const signer = await ethers.getSigner();

  const totalCovers = await cover.getCoverDataCount();
  const coversPerTx = 100;
  const gasLimit = 15000000;

  for (let startId = 1; startId < totalCovers; startId += coversPerTx) {
    const endId = Math.min(startId + coversPerTx - 1, totalCovers);
    const coverIds = [];
    for (let i = startId; i <= endId; i++) {
      coverIds.push(i);
    }

    console.log(`Migrating cover ids: ${coverIds}`);

    const tx = await cover.connect(signer).migrateCoverDataAndPoolAllocations(coverIds, { gasLimit });
    console.log(`tx hash: ${tx.hash}`);

    const txReceipt = await tx.wait();

    console.log(`tx receipt: ${txReceipt}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
