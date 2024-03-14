require('dotenv').config();
const {
  ethers: { getContractAt },
} = require('hardhat');
const { addresses } = require('@nexusmutual/deployments');

const main = async () => {
  const Cover = await getContractAt('Cover', addresses.Cover);
  const Pool = await getContractAt('Pool', addresses.Pool);

  const assets = await Pool.getAssets();
  // const coverCount = await Cover.coverDataCount();

  // console.log(assetIds);
  // console.log(coverCount);
  const totalActiveCovers = [];
  for (let i = 0; i < assets.length; i++) {
    const totalActiveCoverInAsset = await Cover.totalActiveCoverInAsset(i);
    totalActiveCovers.push(totalActiveCoverInAsset);
  }

  for (let i = 0; i < totalActiveCovers.length; i++) {
    if (totalActiveCovers[i].gt(0)) {
      const { lastBucketUpdateId } = await Cover.activeCover(i);
      console.log(lastBucketUpdateId);
    }
  }
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
