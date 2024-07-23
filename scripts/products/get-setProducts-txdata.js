require('dotenv').config();
const path = require('node:path');

const { parse: csvParse } = require('csv-parse/sync');
const fs = require('fs');
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');

const { simulateTransaction, constants } = require('./helpers');

const { COVER_PRODUCTS_ADDRESS, IPFS_API_URL } = constants;
const { MaxUint256 } = ethers.constants;

/**
 * ETH,DAI,USDC - i.e. all cover assets defaults to 0 (see: verifyDecodedTxInputs)
 */
const COVER_ASSETS_ID_MAPPING = {
  ETH: 1,
  DAI: 2,
  USDC: 32,
  'ETH,USDC': 65,
  'USDC,ETH': 65,
  'DAI,USDC': 66,
  'USDC,DAI': 66,
};

const ipfs = ipfsClient({ url: IPFS_API_URL });
const metadataFilePath = path.resolve(__dirname, '../../', 'metadata.json'); // root dir of repo

const retryUpload = async (filePath, retries = 3) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}: Uploading ${filePath} to IPFS`);
      const file = await ipfs.add(fs.readFileSync(filePath));
      await ipfs.pin.add(file.path);
      return file;
    } catch (error) {
      console.log(`Attempt ${attempt} failed:`, error.message);
      if (attempt === retries) {
        throw new Error(`Failed to upload ${filePath} after ${retries} attempts`);
      }
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
};

const verifyDecodedTxInputs = (csvProductData, decodedTxInputs) => {
  for (const csvProduct of csvProductData) {
    // Find matching object in decodedTxInputs by 'Product Name'
    const productName = csvProduct['Product Name'];
    const decodedProduct = decodedTxInputs.find(decoded => decoded.productName === productName);

    if (!decodedProduct) {
      console.log(`\nVerification failed. No matching product found for: ${productName}`);
      return;
    }

    const { productType, coverAssets, initialPriceRatio, capacityReductionRatio } = decodedProduct.product;

    // Set csv default values
    const csvCoverAssets = csvProduct['Cover Assets'].replace(/\s+/g, '');
    const allowedPools = csvProduct['Allowed Pools'].replace(/\s+/g, '');
    const csvCoverAssetsId = COVER_ASSETS_ID_MAPPING[csvCoverAssets] ?? 0; // default to 0 (all coverAssets)
    const csvProductId = csvProduct['Product Id'] || MaxUint256.toString();
    const csvUseFixedPrice = csvProduct['Use fixed price'].trim() === 'TRUE';
    const csvIsDeprecated = csvProduct['Is deprecated'].trim() === 'TRUE';
    const csvAllowedPools = allowedPools ? allowedPools?.split(',').map(pool => pool.trim()) : [];

    // Verify and match properties
    if (decodedProduct.productId !== csvProductId) {
      console.log(decodedProduct.productId, csvProductId);
      throw new Error(`Product Id mismatch for: ${productName}`);
    }

    if (productType !== parseInt(csvProduct['Product Type'], 10)) {
      console.log(productType, parseInt(csvProduct['Product Type'], 10));
      throw new Error(`Product Type mismatch for: ${productName}, productType`);
    }

    if (coverAssets !== csvCoverAssetsId) {
      console.log(coverAssets, csvCoverAssetsId);
      throw new Error(`Cover Assets mismatch for: ${productName}`);
    }

    if (initialPriceRatio !== parseInt(parseFloat(csvProduct['Initial Price Ratio']) * 100)) {
      console.log(initialPriceRatio, parseFloat(csvProduct['Initial Price Ratio']) * 100);
      throw new Error(`Initial Price Ratio mismatch for: ${productName}`);
    }

    if (decodedProduct.product.useFixedPrice !== csvUseFixedPrice) {
      console.log(decodedProduct.product.useFixedPrice, csvUseFixedPrice);
      throw new Error(`Use Fixed Price mismatch for: ${productName}`);
    }

    if (decodedProduct.product.isDeprecated !== csvIsDeprecated) {
      console.log(decodedProduct.product.isDeprecated, csvIsDeprecated);
      throw new Error(`Is Deprecated mismatch for: ${productName}`);
    }

    if (JSON.stringify(decodedProduct.allowedPools) !== JSON.stringify(csvAllowedPools)) {
      console.log(decodedProduct.allowedPools, csvAllowedPools);
      console.log(JSON.stringify(decodedProduct.allowedPools), JSON.stringify(csvAllowedPools));
      throw new Error(`Allowed Pools mismatch for: ${productName}`);
    }

    if (capacityReductionRatio !== parseFloat(csvProduct['Capacity Reduction Ratio']) * 100) {
      console.log(capacityReductionRatio, parseFloat(csvProduct['Capacity Reduction Ratio']) * 100);
      throw new Error(`Capacity Reduction Ratio mismatch for: ${productName}`);
    }
  }

  console.info('\nSuccessfully verified all csv data matches decoded simulated tx inputs');
};

/**
 *
 * Generate the tx data for the Cover.setProducts transaction based using the data
 * in the productsDataFile CSV.
 *
 * @param provider
 * @param productsDataFilePath path for file of products
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async productsDataFilePath => {
  const coverProducts = await ethers.getContractAt('CoverProducts', COVER_PRODUCTS_ADDRESS);
  const productData = csvParse(fs.readFileSync(productsDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(productData);

  // check for any missing required data before processing and uploading files to IPFS
  productData.forEach(data => {
    const productName = data['Product Name'];
    if (!productName) {
      throw new Error('Missing Product Name');
    }
    if (!data['Product Type']) {
      throw new Error(`${productName} - Missing Product Type`);
    }
    if (!data['Initial Price Ratio']) {
      throw new Error(`${productName} - Missing Initial Price Ratio`);
    }
    if (!data['Capacity Reduction Ratio']) {
      throw new Error(`${productName} - Missing Capacity Reduction Ratio`);
    }
  });

  const productEntries = await Promise.all(
    productData.map(async data => {
      // remove whitespaces
      const allowedPools = data['Allowed Pools'].replace(/\s+/g, '');
      const coverAssetsAsText = data['Cover Assets'].replace(/\s+/g, '');

      const coverAssets =
        (coverAssetsAsText === 'DAI' && 0b10) || // DAI only (2)
        (coverAssetsAsText === 'ETH' && 0b01) || // ETH only (1)
        (coverAssetsAsText === 'USDC' && 0b100000) || // USDC only (32)
        ((coverAssetsAsText === 'DAI,USDC' || coverAssetsAsText === 'USDC,DAI') && 0b1000010) || // DAI & USDC (66)
        ((coverAssetsAsText === 'ETH,USDC' || coverAssetsAsText === 'USDC,ETH') && 0b1000001) || // ETH & USDC (65)
        0; // The default is 0 - this means all assets are allowed (no whitelist)

      const annexPath = data.Annex;
      const schedulePath = data.Schedule;
      let metadata = '';
      let metadataContent = Buffer.from('');

      if (annexPath) {
        const annex = await retryUpload(annexPath);
        console.log(`Appending ${annex.path} to ${data['Product Name']} metadata on IPFS`);
        metadataContent = Buffer.from(JSON.stringify({ annex: annex.path }));
      } else if (schedulePath) {
        const schedule = await retryUpload(schedulePath);
        console.log(`Appending ${schedule.path} to ${data['Product Name']} metadata on IPFS`);
        metadataContent = Buffer.from(JSON.stringify({ schedule: schedule.path }));
      }

      if (metadataContent.length > 0) {
        // Temporary file path for metadata content
        fs.writeFileSync(metadataFilePath, metadataContent); // Write metadata content to a temporary file

        // Use retryUpload for uploading and pinning metadata
        metadata = await retryUpload(metadataFilePath);
        console.log(`Metadata pinned at ${metadata.path}`);
      }

      return {
        productName: data['Product Name'],
        productId: data['Product Id'] || MaxUint256, // create new product - use Max Uint.
        ipfsMetadata: metadata ? metadata.path : '', // IPFS metadata is optional.
        product: {
          productType: data['Product Type'],
          yieldTokenAddress: '0x0000000000000000000000000000000000000000', // this only applies
          // to products that fall under Yield Token Incidents claim method. We don't have any
          // products in that category atm, so we can just hardcode it to 0x0.
          coverAssets,
          initialPriceRatio: parseInt(parseFloat(data['Initial Price Ratio']) * 100),
          capacityReductionRatio: parseInt(data['Capacity Reduction Ratio']),
          useFixedPrice: data['Use fixed price'].trim() === 'TRUE',
          isDeprecated: data['Is deprecated'].trim() === 'TRUE',
        },
        allowedPools: allowedPools ? allowedPools.split(',').map(pool => pool.trim()) : [],
      };
    }),
  );

  // Clean up the temporary metadata file after successful upload
  if (fs.existsSync(metadataFilePath)) {
    fs.unlinkSync(metadataFilePath);
  }

  console.log('Tx input: ', productEntries);

  const setProductsTransaction = await coverProducts.populateTransaction.setProducts(productEntries);
  console.log(`Tx data:\n${setProductsTransaction.data}`);

  const decodedTxInputs = await simulateTransaction(setProductsTransaction.data);
  verifyDecodedTxInputs(productData, decodedTxInputs);

  return setProductsTransaction;
};

if (require.main === module) {
  main(process.argv[2]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
