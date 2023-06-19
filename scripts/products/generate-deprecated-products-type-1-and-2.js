require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');

const { parse: csvParse } = require('csv-parse/sync');
const fetch = require("node-fetch");

const { MaxUint256 } = ethers.constants;

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/products', // dir
  'setProducts-txs.json', // filename
);

const YIELD_TOKEN_PRODUCT_TYPE_ID = '2';

const COVER_PROXY_ADDRESS = '0xcafeac0fF5dA0A2777d915531bfA6B29d282Ee62';
const STAKING_PRODUCTS = '0xcafea573fBd815B5f59e8049E71E554bde3477E4';

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
  console.log(`Using cover address: ${COVER_PROXY_ADDRESS}.`);

  const allProductsURL = 'https://api.nexusmutual.io/sdk/products/products.json';


  const allProducts = await fetch(allProductsURL).then(r => r.json());

  const yieldTokenAndCustodyProducts = allProducts.filter(p => !p.isDeprecated && (p.productType === 1 || p.productType === 2));

  const cover = await ethers.getContractAt('Cover', COVER_PROXY_ADDRESS);
  //const stakingProducts = await ethers.getContractAt('StakingProducts', STAKING_PRODUCTS);

  // const productData = csvParse(fs.readFileSync(productsDataFilePath, 'utf8'), {
  //   columns: true,
  //   skip_empty_lines: true,
  // });

  const productEntries = await Promise.all(yieldTokenAndCustodyProducts.map(async data => {
    const coverAssetsAsText = data['Cover Assets'];
    const coverAssets =
      (coverAssetsAsText === 'DAI' && 0b10) || // Yield token cover that uses DAI
      (coverAssetsAsText === 'ETH' && 0b01) || // Yield token cover that uses ETH
      0; // The default is 0 - this means all assets are allowed (no whitelist)


    console.log({
      data
    })

    console.log('Fetching product')

    const productName = await cover.productNames(data.id);
    console.log({
      productName
    })
    const product = await cover.products(data.id);

    console.log({
      product
    });
    product.isDeprecated = true;
    const productParams = {
      productName: productName,
      productId: data.id, // create new product - use Max Uint.
      ipfsMetadata: '', // IPFS metadata is optional.
      product,
      allowedPools: [], //data['Allowed Pools'].split(',').map(parseInt),
    };

    return productParams;
  }));

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
