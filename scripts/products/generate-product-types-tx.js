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

/**
 * How to use from CLI:
 *  node scripts/products/generate-product-types-tx.js [Cover.sol address] [Signing AB Member Address]
 *  The script uses product-type-data.csv as an input. Currently, supports only updates to existing products.
 *  file output is written to scripts/products/setProductTypes-txs.json
 *  Use that transaction data in your MetaMask extension to sign.
 * @param provider
 * @param coverAddress
 * @param signerAddress
 * @returns {Promise<{setProductTypesTransaction: PopulatedTransaction}>}
 */
const main = async (provider, coverAddress, signerAddress) => {
  console.log(`Using cover address: ${coverAddress} and signer address ${signerAddress}`);

  if (!signerAddress) {
    throw new Error(`Undefined signer address ${signerAddress}`);
  }

  const signer = provider.getSigner(signerAddress);

  const V2OnChainProductTypeDataProductsPath = path.join(__dirname, '../v2-migration/input/product-type-data.csv');
  const productTypeData = csvParse(fs.readFileSync(V2OnChainProductTypeDataProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productTypeIpfsHashes = require(path.join(__dirname, '../v2-migration/output/product-type-ipfs-hashes.json'));
  const cover = await ethers.getContractAt('Cover', coverAddress, signer);

  let expectedProductTypeId = 0;
  const productTypeEntries = productTypeData.map(data => {
    return {
      productTypeName: data.Name,
      productTypeId: data.Id,
      ipfsMetadata: productTypeIpfsHashes[data.Id],
      productType: {
        claimMethod: data['Claim Method'],
        gracePeriod: data['Grace Period (days)'] * 24 * 3600, // This MUST be in seconds
      },
      expectedProductTypeId: expectedProductTypeId++,
    };
  });

  const setProductTypesTransaction = await cover.populateTransaction.setProductTypes(productTypeEntries);

  const txs = {
    setProductTypesTransaction,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(txs, null, 2), 'utf8');
  return txs;
};

if (require.main === module) {
  main(ethers.provider, process.argv[2], process.argv[3]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
