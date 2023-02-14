require('dotenv').config();
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');

const { MaxUint256 } = ethers.constants;

const claimMethod = {
  individualClaim: 0,
  yieldTokenIncidents: 1,
};

const sleep = ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

const main = async (coverAddress, abMemberSigner) => {
  const [deployer] = await ethers.getSigners();
  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));
  const cover = new ethers.Contract(coverAddress, abi, deployer);

  const protocolCoverHash = 'Fork Test Mock Protocol Cover Hash';
  const custodianCoverHash = 'Fork Test Mock Custodian Cover Hash';
  const yieldTokenCoverHash = 'Test Mock Yield Token Cover Hash';
  const sherlockExcessCoverHash = 'Test Mock Yield Token Cover Hash';
  const eth2SlashingCoverHash = 'Test Eth 2 Slashing Cover Hash';
  const liquidCollectiveSlashingCoverHash = 'Liquid Collective Cover Hash';

  await cover.connect(abMemberSigner).setProductTypes([
    {
      // Protocol Cover
      productTypeId: MaxUint256,
      ipfsMetadata: protocolCoverHash,
      productType: {
        descriptionIpfsHash: 'protocolCoverIPFSHash',
        claimMethod: claimMethod.individualClaim,
        gracePeriod: 30 * 24 * 3600, // 30 days
      },
    },
    {
      // Custody Cover
      productTypeId: MaxUint256,
      ipfsMetadata: custodianCoverHash,
      productType: {
        descriptionIpfsHash: 'custodyCoverIPFSHash',
        claimMethod: claimMethod.individualClaim,
        gracePeriod: 120 * 24 * 3600, // 120 days
      },
    },
    // Yield Token Cover
    {
      productTypeId: MaxUint256,
      ipfsMetadata: yieldTokenCoverHash,
      productType: {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: claimMethod.yieldTokenIncidents,
        gracePeriod: 14 * 24 * 3600, // 14 days
      },
    },

    // Sherlock Excess Cover
    {
      productTypeId: MaxUint256,
      ipfsMetadata: sherlockExcessCoverHash,
      productType: {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: claimMethod.individualClaim,
        gracePeriod: 30 * 24 * 3600, // 30 days
      },
    },

    // Stakewise Slashing Cover
    {
      productTypeId: MaxUint256,
      ipfsMetadata: eth2SlashingCoverHash,
      productType: {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: claimMethod.individualClaim,
        gracePeriod: 30 * 24 * 3600, // 30 days
      },
    },

    // Liquid Collective slashing cover
    {
      productTypeId: MaxUint256,
      ipfsMetadata: liquidCollectiveSlashingCoverHash,
      productType: {
        descriptionIpfsHash: 'yieldTokenCoverIPFSHash',
        claimMethod: claimMethod.individualClaim,
        gracePeriod: 30 * 24 * 3600, // 30 days
      },
    },
  ]);

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

  await cover.connect(abMemberSigner).setProducts(
    migratableProducts.map(x => {
      const coverAssets =
        (x.name === 'MakerDAO MCD' && 0b01) || // Maker cannot be covered using DAI
        (x.underlyingToken === 'DAI' && 0b10) || // Yield token cover that uses DAI
        (x.underlyingToken === 'ETH' && 0b01) || // Yield token cover that uses ETH
        0;

      const productParams = {
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
