require('dotenv').config();
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');

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

const main = async (coverAddress, abMemberSigner) => {
  const [deployer] = await ethers.getSigners();
  const { abi } = JSON.parse(fs.readFileSync('./artifacts/contracts/modules/cover/Cover.sol/Cover.json'));
  const cover = new ethers.Contract(coverAddress, abi, deployer);
  const ipfs = ipfsClient({
    host: 'ipfs.infura.io',
    port: '5001',
    protocol: 'https',
  });

  // Add product types:
  // Protocol
  const protocolAgreementBuffer = fs.readFileSync('./scripts/v2-migration-input/ProtocolCoverv1.0.pdf');
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
  const custodianAgreementBuffer = fs.readFileSync('./scripts/v2-migration-input/CustodyCoverWordingv1.0.pdf');
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
  const yieldTokenAgreementBuffer = fs.readFileSync('./scripts/v2-migration-input/YieldTokenCoverv1.0.pdf');
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

  {
    const tx = await cover.connect(abMemberSigner).addProductTypes([
      [protocolCoverHash, claimMethod.individualClaim, 30],
      [custodianCoverHash, claimMethod.individualClaim, 120],
      [yieldTokenCoverHash, claimMethod.yieldTokenIncidents, 14],
    ]);
    await tx.wait();
  }

  const migratableProducts = JSON.parse(fs.readFileSync('./deploy/migratable.json'));

  // [todo] TBD, how to uniquely identify each product through IPFS
  // Maybe exceptions and special wording notes could also have an on-chain reference
  // const migratableProductsIpfsHashes = [];
  // for (const product of migratableProducts) {
  // console.log({ product });
  // const ipfsUpload = await ipfs.add(
  // Buffer.from(
  // JSON.stringify({
  // name: product.name,
  // }),
  // ),
  // );
  // await sleep(20000); // Required to avoid "Too many requests"
  // migratableProductsIpfsHashes.push(ipfsUpload.path);
  // }
  // console.log({ migratableProductsIpfsHashes });

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
    );
    await tx.wait();
  }

  const products = await Promise.all(
    Array(100)
      .fill()
      .map((_, i) => cover.products(i)),
  );
};

if (!module.parent) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = { main };
