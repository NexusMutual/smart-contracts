require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');

const { parse: csvParse } = require('csv-parse/sync');
const ipfsClient = require('ipfs-http-client');

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';
const ipfs = ipfsClient({ url: IPFS_API_URL });

const { MaxUint256 } = ethers.constants;

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/products', // dir
  'setProducts-txs.json', // filename
);

const YIELD_TOKEN_PRODUCT_TYPE_ID = '2';
const COVER_PROXY_ADDRESS = '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62';

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
 * CLI parameters in this order: productsDataFilePath
 *
 * NOTE: Product editing not yet supported. 'Product Id' is ignored.
 *
 * The output is written to OUTPUT_FILE.
 *
 * Use setProductsTransaction.data as the transaction data in your wallet of choice.
 *
 * @param provider
 * @param productsDataFilePath path for file of products
 * @param coverAddress address of the Cover contract
 * @param signerAddress address of the AB signer - not encoded in the transaction blob
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async (provider, productsDataFilePath) => {
  console.log(`Using cover address: ${COVER_PROXY_ADDRESS}`);

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
        (coverAssetsAsText === 'DAI' && 0b10) || // DAI
        (coverAssetsAsText === 'ETH' && 0b01) || // ETH
        0; // The default is 0 - this means all assets are allowed (no whitelist)

      const filePath = data['IPFS Metadata'];
      let metadata = '';

      if (filePath) {
        const annex = await retryUpload(filePath);

        console.log(`Appending ${annex.path} to ${data['Product Name']} metadata on IPFS`);
        const metadataContent = Buffer.from(JSON.stringify({ annex: annex.path }));
        const metadataFilePath = '/Users/rox/data/projects/nexus-mutual/prod/smart-contracts/metadata.json'; // Temporary file path for metadata content
        fs.writeFileSync(metadataFilePath, metadataContent); // Write metadata content to a temporary file

        // Use retryUpload for uploading and pinning metadata
        metadata = await retryUpload(metadataFilePath);
        console.log(`Metadata pinned at ${metadata.path}`);

        // Clean up the temporary metadata file after successful upload
        // fs.unlinkSync(metadataFilePath);
      }

      const productParams = {
        productName: data['Product Name'],
        productId: data['Product Id'] || MaxUint256, // create new product - use Max Uint.
        ipfsMetadata: metadata ? metadata.path : '', // IPFS metadata is optional.
        product: {
          productType: data['Product Type'],
          yieldTokenAddress: '0x0000000000000000000000000000000000000000',
          coverAssets,
          initialPriceRatio: parseInt(parseFloat(data['Initial Price Ratio']) * 100),
          capacityReductionRatio: parseInt(data['Capacity Reduction Ratio']),
          useFixedPrice: data['Use fixed price'].trim() === 'TRUE',
          isDeprecated: data['Is deprecated'].trim() === 'TRUE',
        },
        allowedPools: data['Allowed Pools'] ? data['Allowed Pools'].split(',').map(pool => pool.trim()) : [],
      };
      return productParams;
    }),
  );

  console.log('Tx input: ', productEntries);

  const setProductsTransaction = await cover.populateTransaction.setProducts(productEntries);

  console.log(`Tx data ${setProductsTransaction.data}`);

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(setProductsTransaction, null, 2), 'utf8');

  return setProductsTransaction;
};

if (require.main === module) {
  main(ethers.provider, process.argv[2]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
