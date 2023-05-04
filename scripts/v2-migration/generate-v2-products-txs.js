require('dotenv').config();
const { ethers, config } = require('hardhat');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const { parse: csvParse } = require('csv-parse/sync');

const { MaxUint256 } = ethers.constants;

const productTypeIds = {
  Protocol: 0,
  Custody: 1,
  'Yield Token': 2,
  'Stakewise Slashing': 3,
  'Sherlock Excess': 4,
  'Liquid Collective Slashing': 5,
};

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

  const V2OnChainProductTypeDataProductsPath = path.join(__dirname, 'input/product-type-data.csv');
  const productTypeData = csvParse(fs.readFileSync(V2OnChainProductTypeDataProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productTypeIpfsHashes = require(path.join(__dirname, 'output/product-type-ipfs-hashes.json'));
  const cover = new ethers.Contract(coverAddress, abi, signer);

  console.log({
    productTypeData
  });

  let expectedProductTypeId = 0;
  const productTypeEntries = productTypeData.map(data => {
    return {
      productTypeName: data.Name,
      productTypeId: MaxUint256, // create new product type
      ipfsMetadata: productTypeIpfsHashes[data.Id],
      productType: {
        claimMethod: data['Claim Method'],
        gracePeriod: parseInt(data['Grace Period (days)']) * 24 * 3600,
      },
      expectedProductTypeId: expectedProductTypeId++,
    };
  });

  console.log({
    productTypeEntries
  });

  const setProductTypesTransaction = await cover.populateTransaction.setProductTypes(productTypeEntries);


  const txs = {
    setProductTypesTransaction,
    productTypeData,
    productTypeIds,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(txs, null, 2), 'utf8');

  return txs;

  const V2OnChainProductDataProductsPath = path.join(__dirname, 'input/product-data.csv');
  const productData = csvParse(fs.readFileSync(V2OnChainProductDataProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productAddressesPath = path.join(__dirname, 'output/product-addresses.json');
  const productAddresses = require(productAddressesPath);
  const productIpfsHashesPath = path.join(__dirname, 'output/product-ipfs-hashes.json');
  const productIpfsHashes = require(productIpfsHashesPath);

  assert(
    productAddresses.length === productData.length,
    `productAddresses JSON has ${productAddresses.length} items while CSV has ${productData.length}`,
  );

  let expectedProductId = 0;
  const productEntries = productData.map(data => {
    const productId = productAddresses.map(a => a.toLowerCase()).indexOf(data['Product Address'].toLowerCase());

    assert(
      expectedProductId++ === productId,
      `Product id mismatch ${expectedProductId} ${productId} for: ${data.Name}`,
    );
    const ipfsMetadata = productIpfsHashes[productId.toString()];

    const coverAssetsAsText = data['Cover Assets'];
    const coverAssets =
      (coverAssetsAsText === 'DAI' && 0b10) || // Yield token cover that uses DAI
      (coverAssetsAsText === 'ETH' && 0b01) || // Yield token cover that uses ETH
      0; // The default is 0 - this means all assets are allowed (no whitelist)

    const productParams = {
      productName: data.Name,
      productId: MaxUint256, // create new product - use Max Uint.
      ipfsMetadata: ipfsMetadata || '', // IPFS metadata is optional.
      product: {
        productType: productTypeIds[data['Product Type']],
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
      allowedPools: [],
    };

    return productParams;
  });

  const setProductsTransaction = await cover.populateTransaction.setProducts(productEntries);

  const finalTxs = {
    setProductTypesTransaction,
    setProductsTransaction,
    productTypeData,
    productData,
    productTypeIds,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalTxs, null, 2), 'utf8');

  return finalTxs;
};

if (require.main === module) {
  main(ethers.provider, process.argv[2], process.argv[3]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
