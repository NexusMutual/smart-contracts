require('dotenv').config();
const path = require('node:path');

const nexusSdk = require('@nexusmutual/deployments');
const { parse: csvParse } = require('csv-parse/sync');
const fs = require('fs');
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';
const ipfs = ipfsClient({ url: IPFS_API_URL });

const { MaxUint256 } = ethers.constants;
const COVER_PROXY_ADDRESS = nexusSdk.addresses.Cover;
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

/**
 *
 * Generate the tx data for the Cover.setProducts transaction based using the data
 * in the productsDataFile CSV.
 *
 * @param provider
 * @param productsDataFilePath path for file of products
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async (provider, productsDataFilePath) => {
  const cover = await ethers.getContractAt('Cover', COVER_PROXY_ADDRESS);
  const productData = csvParse(fs.readFileSync(productsDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  console.log(productData);

  const productEntries = await Promise.all(
    productData.map(async data => {
      const coverAssetsAsText = data['Cover Assets'];
      const coverAssets =
        (coverAssetsAsText === 'DAI' && 0b10) || // DAI only (2)
        (coverAssetsAsText === 'ETH' && 0b01) || // ETH only (1)
        (coverAssetsAsText === 'USDC' && 0b100000) || // USDC only (32)
        (coverAssetsAsText === 'DAI,USDC' && 0b1000010) || // DAI & USDC (66)
        (coverAssetsAsText === 'ETH,USDC' && 0b1000001) || // ETH & USDC (65)
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
  console.log(`Destination address: ${COVER_PROXY_ADDRESS}`);
  console.log(`Tx data:\n${setProductsTransaction.data}`);

  return setProductsTransaction;
};

if (require.main === module) {
  main(ethers.provider, process.argv[2]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
