require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');

const { parse: csvParse } = require('csv-parse/sync');

const { MaxUint256 } = ethers.constants;

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/products', // dir
  'setProducts-txs.json', // filename
);

const YIELD_TOKEN_PRODUCT_TYPE_ID = '2';

/**
 *
 * Generate the tx data for the Cover.setProducts transaction based using the data
 * in the productsDataFile CSV.
 *
 * CLI parameters in this order: productsDataFilePath coverAddress signerAddress
 *
 * NOTE: Product editing not yet supported. 'Product Id' is ignored.
 *
 * @param provider
 * @param productsDataFilePath path for file of products
 * @param coverAddress address of the Cover contract
 * @param signerAddress address of the AB signer - not encoded in the transaction blob
 * @returns {Promise<{setProductsTransaction: *}>}
 */
const main = async (provider, productsDataFilePath, coverAddress) => {
  console.log(`Using cover address: ${coverAddress}.`);

  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));

  const cover = new ethers.Contract(coverAddress, abi);

  const productData = csvParse(fs.readFileSync(productsDataFilePath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productEntries = productData.map(data => {
    const coverAssetsAsText = data['Cover Assets'];
    const coverAssets =
      (coverAssetsAsText === 'DAI' && 0b10) || // Yield token cover that uses DAI
      (coverAssetsAsText === 'ETH' && 0b01) || // Yield token cover that uses ETH
      0; // The default is 0 - this means all assets are allowed (no whitelist)

    const productParams = {
      productName: data['Product Name'],
      productId: MaxUint256, // create new product - use Max Uint.
      ipfsMetadata: data['IPFS Metadata'], // IPFS metadata is optional.
      product: {
        productType: data['Product Type'],
        yieldTokenAddress:
          data['Product Type'] === YIELD_TOKEN_PRODUCT_TYPE_ID
            ? data['Yield Token Address']
            : '0x0000000000000000000000000000000000000000',
        coverAssets,
        // works for integers: parseInt('10%') === 10; to convert it to 4 decimal ratio you multiply by 100
        initialPriceRatio: parseInt(data['Initial Price Ratio']) * 100,
        // works for integers: parseInt('0%') === 0
        capacityReductionRatio: parseInt(data['Capacity Reduction Ratio']),
        useFixedPrice: data['Use fixed price'].trim() === 'yes',
      },
      allowedPools: data['Allowed Pools'].split(',').map(parseInt),
    };

    return productParams;
  });

  console.log(productEntries);

  const setProductsTransaction = await cover.populateTransaction.setProducts(productEntries);

  const txs = {
    setProductsTransaction,
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
