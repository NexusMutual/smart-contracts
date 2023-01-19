require('dotenv').config();
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');

const { AddressZero, MaxUint256 } = ethers.constants;

const claimMethod = {
  individualClaim: 0,
  yieldTokenIncidents: 1,
};

const productType = {
  protocol: 0,
  custodian: 1,
  token: 2,
};

const sleep = ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

const main = async (coverAddress, abMemberSigner, enableIPFSUploads) => {
  const [deployer] = await ethers.getSigners();
  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));
  const cover = new ethers.Contract(coverAddress, abi, deployer);
  const ipfs = ipfsClient({
    host: 'ipfs.infura.io',
    port: '5001',
    protocol: 'https',
  });

  let protocolCoverHash;
  let custodianCoverHash;
  let yieldTokenCoverHash;

  if (enableIPFSUploads) {
    // Add product types:
    // Protocol
    const protocolAgreementBuffer = fs.readFileSync('./scripts/v2-migration/input/ProtocolCoverv1.0.pdf');
    const protocolAgreement = await ipfs.add(protocolAgreementBuffer);

    const protocolCover = await ipfs.add(
      Buffer.from(
        JSON.stringify({
          agreement: protocolAgreement.path,
          title: 'Protocol cover',
        }),
      ),
    );
    const protocolCoverHash = protocolCover.path;
    console.log({ protocolCoverHash });
    ipfs.pin.add(protocolCoverHash);

    // Custodian
    const custodianAgreementBuffer = fs.readFileSync('./scripts/v2-migration/input/CustodyCoverWordingv1.0.pdf');
    const custodianAgreement = await ipfs.add(custodianAgreementBuffer);
    const custodianCover = await ipfs.add(
      Buffer.from(
        JSON.stringify({
          agreement: custodianAgreement.path,
          title: 'Custodian cover',
        }),
      ),
    );
    const custodianCoverHash = custodianCover.path;
    console.log({ custodianCoverHash });
    ipfs.pin.add(custodianCoverHash);

    // Yield Token
    const yieldTokenAgreementBuffer = fs.readFileSync('./scripts/v2-migration/input/YieldTokenCoverv1.0.pdf');
    const yieldTokenAgreement = await ipfs.add(yieldTokenAgreementBuffer);
    const yieldTokenCover = await ipfs.add(
      Buffer.from(
        JSON.stringify({
          agreement: yieldTokenAgreement.path,
          name: 'Yield token cover',
        }),
      ),
    );
    const yieldTokenCoverHash = yieldTokenCover.path;
    console.log({ yieldTokenCoverHash });
    ipfs.pin.add(yieldTokenCoverHash);
  } else {
    protocolCoverHash = 'Fork Test Mock Protocol Cover Hash';
    custodianCoverHash = 'Fork Test Mock Custodian Cover Hash';
    yieldTokenCoverHash = 'Test Mock Yield Token Cover Hash';
  }

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
  ]);

  const migratableProducts = JSON.parse(fs.readFileSync('./deploy/migratableProducts.json'));

  // Use the next line to skip reuploading when testing
  // const migratableProductsIpfsHashes = JSON.parse(fs.readFileSync('./deploy/migratableProductsIpfsHashes.json'));
  const migratableProductsIpfsHashes = [];
  for (const product of migratableProducts) {
    console.log({ product });
    const ipfsUpload = await ipfs.add(
      Buffer.from(
        JSON.stringify({
          name: product.name,
        }),
      ),
    );
    await sleep(20000); // Required to avoid "Too many requests"
    migratableProductsIpfsHashes.push(ipfsUpload.path);
  }
  console.log({ migratableProductsIpfsHashes });

  fs.writeFileSync(
    './deploy/migratableProductsIpfsHashes.json',
    JSON.stringify(migratableProductsIpfsHashes, null, 2),
    'utf8',
  );

  {
    const tx = await cover.connect(abMemberSigner).addProducts(
      migratableProducts.map(x => [
        productType[x.type],
        x.type === 'token' ? x.coveredToken : '0x0000000000000000000000000000000000000000',
        (x.name === 'MakerDAO MCD' && 0b01) || // Maker cannot be covered using DAI
          (x.underlyingToken === 'DAI' && 0b10) || // Yield token cover that uses DAI
          (x.underlyingToken === 'ETH' && 0b01) || // Yield token cover that uses ETH
          0, // 0 means the fallback is going to be used instead
        1000,
        0,
      ]),
      migratableProductsIpfsHashes,
    );
    await tx.wait();
  }
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
