require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const { parse: csvParse } = require('csv-parse/sync');

const ipfsClient = require('ipfs-http-client');

const { simulateTransaction, constants } = require('./helpers');

const { MaxUint256 } = ethers.constants;
const { COVER_PRODUCTS_ADDRESS, IPFS_API_URL } = constants;

const ipfs = ipfsClient({ url: IPFS_API_URL });

const verifyDecodedTxInputs = (csvProductTypeData, decodedTxInputs) => {
  for (const csvProductTypes of csvProductTypeData) {
    // Find matching object in decodedTxInputs by 'Product Name'
    const productTypeName = csvProductTypes.Name;
    const decodedProductType = decodedTxInputs.find(decoded => decoded.productTypeName === productTypeName);

    if (!decodedProductType) {
      console.log(`\nVerification failed. No matching product found for: ${productTypeName}`);
      return;
    }

    const { claimMethod, gracePeriod } = decodedProductType.productType;

    // Set csv default values
    const csvProductTypeId = csvProductTypes.Id || MaxUint256.toString();
    const csvGracePeriod = Number(csvProductTypes['Grace Period (days)']) * 24 * 3600; // This MUST be in seconds

    // Verify and match properties
    if (decodedProductType.productTypeId !== csvProductTypeId) {
      console.log(decodedProductType.productTypeId, csvProductTypeId);
      throw new Error(`Product Type Id mismatch for: ${productTypeName}`);
    }

    if (gracePeriod !== csvGracePeriod) {
      console.log(decodedProductType.product.gracePeriod, csvGracePeriod);
      throw new Error(`Grace Period mismatch for: ${productTypeName}`);
    }

    if (claimMethod !== 0) {
      console.log(claimMethod, 0);
      throw new Error(`Claim Method: ${productTypeName}`);
    }
  }

  console.info('\nSuccessfully verified all csv data matches decoded simulated tx inputs');
};

/**
 *
 * Generate the tx data for the Cover.setProductsTypes transaction based on the data
 * in the productsDataFile CSV.
 *
 * @param productsTypesDataFilePath path for file of products
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async productsTypesDataFilePath => {
  const coverProducts = await ethers.getContractAt('CoverProducts', COVER_PRODUCTS_ADDRESS);

  const productTypeData = csvParse(fs.readFileSync(productsTypesDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  // check for any missing required data before processing and uploading files to IPFS
  productTypeData.forEach(productType => {
    if (!productType.Name) {
      throw new Error('Missing ProductType Name');
    }
    if (!productType['Grace Period (days)']) {
      throw new Error(`${productType.Name} - Missing Grace Period (days)ype`);
    }
    if (!productType['Cover Wording URL']) {
      throw new Error(`${productType.Name} - Missing Cover Wording URL`);
    }
  });

  const productTypeEntries = await Promise.all(
    productTypeData.map(async (productType, i) => {
      const filePath = productType['Cover Wording URL'];

      console.log(`Uploading ${productType.Name} cover wording from ${filePath} to IPFS`);
      const coverWording = await ipfs.add(fs.readFileSync(filePath));

      console.log(`Pinning ${coverWording.path}`);
      await ipfs.pin.add(coverWording.path);

      return {
        productTypeName: productType.Name,
        productTypeId: productType.Id || MaxUint256, // create new product type
        ipfsMetadata: coverWording.path,
        productType: {
          claimMethod: 0, // none of the current products use group claims
          gracePeriod: productType['Grace Period (days)'] * 24 * 3600, // This MUST be in seconds
        },
        expectedProductTypeId: i,
      };
    }),
  );

  const setProductTypesTransaction = await coverProducts.populateTransaction.setProductTypes(productTypeEntries);
  console.log(setProductTypesTransaction);

  const decodedTxInputs = await simulateTransaction(setProductTypesTransaction.data);
  verifyDecodedTxInputs(productTypeData, decodedTxInputs);

  return { setProductTypesTransaction };
};

if (require.main === module) {
  main(process.argv[2]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
