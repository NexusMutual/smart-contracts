const { ethers } = require('hardhat');
const { addresses, Cover, CoverViewer } = require('@nexusmutual/deployments');
const assert = require('assert');

async function main() {
  const cover = await ethers.getContractAt(Cover, addresses.Cover);
  const coverViwer = await ethers.getContractAt(CoverViewer, addresses.CoverViewer);

  const coversPerTx = 100;
  const totalCovers = (await cover.getCoverDataCount()).toNumber();
  const allCoverIds = new Array(totalCovers).fill(0).map((_, i) => i + 1);

  while (allCoverIds.length > 0) {
    const coverIds = allCoverIds.splice(0, coversPerTx);
    console.log(`Checking from ${coverIds[0]} to ${coverIds[coverIds.length - 1]}`);
    const covers = await coverViwer.getCovers(coverIds);

    for (let i = 0; i < coverIds.length; i++) {
      assert(covers[i].amount > 0);
      assert(covers[i].start > 0);
      assert(covers[i].originalCoverId.eq(coverIds[i]));
      assert(covers[i].latestCoverId.eq(coverIds[i]));
    }
  }

  console.log('All covers checked');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
