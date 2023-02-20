require('dotenv').config();
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

const { parse: csvParse } = require('csv-parse/sync');

const { MaxUint256 } = ethers.constants;

const claimMethod = {
  individualClaim: 0,
  yieldTokenIncidents: 1,
};

const main = async coverAddress => {
  const [deployer] = await ethers.getSigners();
  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));

  const V2OnChainProductTypeDataProductsPath = path.join(__dirname, 'input/product-type-data.csv');
  const productTypeData = csvParse(fs.readFileSync(V2OnChainProductTypeDataProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productTypeIpfsHashes = require(__dirname + '/output/product-type-ipfs-hashes.json');
  const productIpfsHashes = require(__dirname + '/output/product-ipfs-hashes.json');
  const cover = new ethers.Contract(coverAddress, abi, deployer);

  const productTypeEntries = productTypeData.map(data => {
    console.log(data);

    return {
      productTypeName: data.Name,
      productTypeId: MaxUint256, // create new product type
      ipfsMetadata: productTypeIpfsHashes[data.Id],
      productType: {
        descriptionIpfsHash: 'protocolCoverIPFSHash',
        claimMethod: data['Claim Method'],
        gracePeriod: data['Grace Period (days)'],
      },
    };
  });

  console.log(productTypeEntries);

  const setProductTypesTransaction = await cover.populateTransaction.setProductTypes(productTypeEntries);

  return;

  const productTypeIds = {
    protocol: 0,
    custodian: 1,
    token: 2,
    sherlock: 3,
    eth2slashing: 4,
    liquidcollective: 5,
  };

  const migrateableProductsPath = path.join(__dirname, 'v2-migration/output/migratableProducts.json');

  const migratableProducts = JSON.parse(fs.readFileSync(migrateableProductsPath));

  // Use the next line to skip reuploading when testing
  // const migratableProductsIpfsHashes = JSON.parse(fs.readFileSync('./deploy/migratableProductsIpfsHashes.json'));
  const migratableProductsIpfsHashes = [];

  for (const product of migratableProducts) {
    migratableProductsIpfsHashes.push(`Fork Test Mock IPFS Path Product ${product.name}`);
  }

  const migrateableProductsIpfsHashesPath = path.join(
    __dirname,
    'v2-migration/output/migratableProductsIpfsHashes.json',
  );

  fs.writeFileSync(migrateableProductsIpfsHashesPath, JSON.stringify(migratableProductsIpfsHashes, null, 2), 'utf8');

  console.log(`Call Cover.setProducts with ${migratableProducts.length} products.`);
  await cover.setProducts(
    migratableProducts.map(x => {
      const coverAssets =
        (x.name === 'MakerDAO MCD' && 0b01) || // Maker cannot be covered using DAI
        (x.underlyingToken === 'DAI' && 0b10) || // Yield token cover that uses DAI
        (x.underlyingToken === 'ETH' && 0b01) || // Yield token cover that uses ETH
        0;

      const productParams = {
        productName: x.name,
        productId: MaxUint256,
        ipfsMetadata: 'product 0 metadata',
        product: {
          productType: productTypeIds[x.type],
          yieldTokenAddress: x.type === 'token' ? x.coveredToken : '0x0000000000000000000000000000000000000000',
          coverAssets,
          initialPriceRatio: 100,
          capacityReductionRatio: 0,
          // TODO: apply fixed price for certain products. stakewise, alluvial, maybe others
          useFixedPrice: false,
        },
        allowedPools: [],
      };

      return productParams;
    }),
  );
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
