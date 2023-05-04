require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { parse: csvParse } = require('csv-parse/sync');

const { MaxUint256 } = ethers.constants;

const OUTPUT_FILE = path.join(
  config.paths.root,
  'scripts/v2-migration/output', // dir
  'setProductTypes-setProducts-txs.json', // filename
);

const main = async (provider, coverAddress, signerAddress) => {
  console.log(`Using cover address: ${coverAddress} and signer address ${signerAddress}`);

  if (!signerAddress) {
    throw new Error(`Undefined signer address ${signerAddress}`);
  }

  const signer = provider.getSigner(signerAddress);
  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));

  const cover = new ethers.Contract(coverAddress, abi, signer);

  const productData = [{
    Name: "EtherFi 5ETH",
    'Product Type': 'ETH Staking Operator',
    'Initial Price Ratio': 10,
    'Capacity Reduction Ratio': 0,
    'Use Fixed Price': 'Yes',
    'Cover Assets': 0,
    'allowedPools': [5],
    'ipfsMetadata': 'QmUr5uXmEL4V8xfr2yYicRzkx27D7QDGNmpSXCXDVXieGP',
    productTypeId: 6
  }];

  const productEntries = productData.map(data => {


    const coverAssetsAsText = data['Cover Assets'];
    const coverAssets =
      (coverAssetsAsText === 'DAI' && 0b10) || // Yield token cover that uses DAI
      (coverAssetsAsText === 'ETH' && 0b01) || // Yield token cover that uses ETH
      0; // The default is 0 - this means all assets are allowed (no whitelist)

    const productParams = {
      productName: data.Name,
      productId: MaxUint256, // create new product - use Max Uint.
      ipfsMetadata: data.ipfsMetadata, // IPFS metadata is optional.
      product: {
        productType: data.productTypeId,
        yieldTokenAddress:
          data['Product Type'] === 'Yield Token'
            ? data['Yield Token Address']
            : '0x0000000000000000000000000000000000000000',
        coverAssets,
        // works for integers: parseInt('10%') === 10; to convert it to 4 decimal ratio you multiply by 100
        initialPriceRatio: parseInt(data['Initial Price Ratio']) * 100,
        // works for integers: parseInt('0%') === 0
        capacityReductionRatio: parseInt(data['Capacity Reduction Ratio']),
        useFixedPrice: data['Use Fixed Price'] === 'Yes',
      },
      allowedPools: data.allowedPools,
    };

    return productParams;
  });

  console.log(productEntries);

  const setProductsTransaction = await cover.populateTransaction.setProducts(productEntries);

  const txs = {
    setProductsTransaction,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(txs, null, 2), 'utf8');

  console.log(txs);
  return txs;
};

if (require.main === module) {
  main(ethers.provider, process.argv[2], process.argv[3]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
