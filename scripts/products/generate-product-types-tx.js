require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');

const { parse: csvParse } = require('csv-parse/sync');

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/products/', // dir
  'setProductTypes-txs.json', // filename
);

const COVER_ADDRESS = '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62';

/**
 * How to use from CLI:
 *  node scripts/products/generate-product-types-tx.js
 *  The script uses product-type-data.csv as an input. Currently, supports only updates to existing products.
 *  file output is written to scripts/products/setProductTypes-txs.json
 *  Use that transaction data in your MetaMask extension to sign.
 */
const main = async () => {
  const cover = await ethers.getContractAt('Cover', COVER_ADDRESS);

  const V2OnChainProductTypeDataProductsPath = path.join(__dirname, '../v2-migration/input/product-type-data.csv');

  const productTypeData = csvParse(fs.readFileSync(V2OnChainProductTypeDataProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });
  const productTypeEntries = productTypeData.map((data, i) => {
    return {
      productTypeName: '',
      productTypeId: data.Id,
      ipfsMetadata: '',
      productType: {
        claimMethod: data['Claim Method'],
        gracePeriod: data['Grace Period (days)'] * 24 * 3600, // This MUST be in seconds
      },
      expectedProductTypeId: i,
    };
  });

  const setProductTypesTransaction = await cover.populateTransaction.setProductTypes(productTypeEntries);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({ setProductTypesTransaction }, null, 2), 'utf8');

  console.log(`Wrote transaction data to ${OUTPUT_FILE}`);

  return { setProductTypesTransaction };
};

if (require.main === module) {
  main().catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
