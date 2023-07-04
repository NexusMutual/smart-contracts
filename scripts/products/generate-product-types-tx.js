require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const { MaxUint256 } = ethers.constants;

const { parse: csvParse } = require('csv-parse/sync');
const ipfsClient = require('ipfs-http-client');
const fetch = require('node-fetch');

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/products/', // dir
  'setProductTypes-txs.json', // filename
);

const COVER_ADDRESS = '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62';

const ipfs = ipfsClient({ url: IPFS_API_URL });

/**
 *
 * Generate the tx data for the Cover.setProductsTypes transaction based on the data
 * in the productsDataFile CSV.
 *
 * CLI parameters in this order: productsTypesDataFilePath
 *
 * NOTE: Product type editing not yet supported. 'Id' is ignored.
 *
 * The output is written to OUTPUT_FILE.
 *
 * @param productsTypesDataFilePath path for file of products
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async productsTypesDataFilePath => {
  const cover = await ethers.getContractAt('Cover', COVER_ADDRESS);

  const productTypeData = csvParse(fs.readFileSync(productsTypesDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productTypeEntries = await Promise.all(
    productTypeData.map(async (data, i) => {
      const url = data['Cover Wording URL'];

      const productTypeName = data.Name;
      console.log(`Fetching ${productTypeName} cover wording from ${url}`);
      const agreementBuffer = await fetch(url).then(x => x.buffer());

      console.log(`Uploading ${productTypeName} cover wording to IPFS`);
      const agreement = await ipfs.add(agreementBuffer);
      const productTypeHash = agreement.path;

      console.log(`Pinning ${productTypeHash}`);
      await ipfs.pin.add(productTypeHash);

      return {
        productTypeName: data.Name,
        productTypeId: MaxUint256, // create new product type
        ipfsMetadata: productTypeHash,
        productType: {
          claimMethod: data['Claim Method'],
          gracePeriod: data['Grace Period (days)'] * 24 * 3600, // This MUST be in seconds
        },
        expectedProductTypeId: i,
      };
    }),
  );

  const setProductTypesTransaction = await cover.populateTransaction.setProductTypes(productTypeEntries);

  console.log(`Tx data ${setProductTypesTransaction.data}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ setProductTypesTransaction }, null, 2), 'utf8');

  console.log(`Wrote transaction data to ${OUTPUT_FILE}`);

  return { setProductTypesTransaction };
};

if (require.main === module) {
  main(process.argv[2]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
