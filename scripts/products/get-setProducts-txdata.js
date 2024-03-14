require('dotenv').config();
const path = require('node:path');
const { inspect } = require('node:util');

const nexusSdk = require('@nexusmutual/deployments');
const axios = require('axios');
const { parse: csvParse } = require('csv-parse/sync');
const fs = require('fs');
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';
const ipfs = ipfsClient({ url: IPFS_API_URL });

const { MaxUint256 } = ethers.constants;
const AB_MEMBER = '0x87B2a7559d85f4653f13E6546A14189cd5455d45';
const COVER_PROXY_ADDRESS = nexusSdk.addresses.Cover;
const metadataFilePath = path.resolve(__dirname, '../../', 'metadata.json'); // root dir of repo

/**
 * NOTE: requires TENDERLY_ACCESS_KEY env
 * @param {HexString} input - the tx.data
 */
const simulateTransaction = async input => {
  const payload = {
    save: true, // save result to dashboard
    save_if_fails: true, // show reverted txs in dashboard
    simulation_type: 'full',
    network_id: '1',
    from: AB_MEMBER,
    to: COVER_PROXY_ADDRESS,
    gas: 8000000,
    gas_price: 0,
    value: 0,
    input,
  };

  const response = await axios.post(
    `https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/simulate`,
    payload,
    { headers: { 'X-Access-Key': process.env.TENDERLY_ACCESS_KEY } },
  );

  const { transaction, simulation } = response.data;
  const [{ value: decodedTxInputs }] = transaction.transaction_info.call_trace.decoded_input;
  console.info('cover.setProducts input:\n', inspect(decodedTxInputs, { depth: null }));
  console.info(
    '\nTenderly Simulated transaction:\n',
    `https://dashboard.tenderly.co/NexusMutual/nexusmutual/simulator/${simulation.id}`,
  );

  return decodedTxInputs;
};

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
    const csvCoverAssetsId = COVER_ASSETS_ID_MAPPING[csvProduct['Cover Assets']] ?? 0; // default to 0 (all coverAssets)
    const csvProductId = csvProduct['Product Id'] || MaxUint256.toString();
    const csvUseFixedPrice = csvProduct['Use fixed price'].trim() === 'TRUE';
    const csvIsDeprecated = csvProduct['Is deprecated'].trim() === 'TRUE';
    const csvAllowedPools = csvProduct['Allowed Pools']
      ? csvProduct['Allowed Pools']?.split(',').map(pool => pool.trim())
      : [];

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
  const cover = await ethers.getContractAt('Cover', COVER_PROXY_ADDRESS);
  const productData = csvParse(fs.readFileSync(productsDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(productData);

  const productEntries = await Promise.all(
    productData.map(async data => {
      const coverAssetsAsText = data['Cover Assets'].replace(/\s+/g, ''); // remove whitespace
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
        allowedPools: data['Allowed Pools'] ? data['Allowed Pools'].split(',').map(pool => pool.trim()) : [],
      };
    }),
  );

  // Clean up the temporary metadata file after successful upload
  fs.unlinkSync(metadataFilePath);

  console.log('Tx input: ', productEntries);

  const setProductsTransaction = await cover.populateTransaction.setProducts(productEntries);
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