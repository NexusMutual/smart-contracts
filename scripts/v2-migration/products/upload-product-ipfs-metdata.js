require('dotenv').config();
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const sleep = ms => {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
};

function decode(buf) {
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(buf);
}

async function readFileFromURL(url) {
  const file = await fetch(url).then(x => x.arrayBuffer());
  return file;
}

const CoverWordings = {
  protocol: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f4c4cca088730ac54ccc_ProtocolCoverv1.0.pdf',
  custodian:
    'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f4d7b378db634f0f9a9d_CustodyCoverWordingv1.0.pdf',
  token: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f475a1a2c7250a1e9697_YieldTokenCoverv1.0.pdf',
  sherlock:
    'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f7c4f0864e48c46ad93c_SherlockExcessCoverv1.0.pdf',
  eth2slashing:
    'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f8390352b0dc1cb8112b_ETH2-Staking-Cover-Wording-v1.0.pdf',
  liquidcollective:
    'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d7cb35dea9958c3952e9c0_Liquid-Collective-v1.0.pdf',
};

const IPFS = {
  API: {
    url: 'https://api.nexusmutual.io/ipfs-api/api/v0',
  },
  GATEWAY: 'https://api.nexusmutual.io/ipfs/',
};

async function uploadCoverWordingForProductType(ipfs, productType) {
  const url = CoverWordings[productType];
  console.log(`Fetching ${productType} cover wording from ${url}..`);
  const protocolAgreementBuffer = await readFileFromURL(url);

  console.log(`Uploading ${productType} cover wording to IPFS..`);
  const protocolAgreement = await ipfs.add(protocolAgreementBuffer);

  console.log('Uploading Agreement reference + title.');
  const protocolCover = await ipfs.add(
    Buffer.from(
      JSON.stringify({
        agreement: protocolAgreement.path,
        title: 'Protocol cover',
      }),
    ),
  );
  const protocolCoverHash = protocolCover.path;

  console.log(`Pinning ${protocolCoverHash}`);
  await ipfs.pin.add(protocolCoverHash);

  console.log(`Succesfully pinned`);
  return protocolCoverHash;
}

const main = async () => {
  const ipfs = ipfsClient(IPFS.API);
  const productTypes = ['protocol', 'custodian', 'token', 'sherlock', 'eth2slashing', 'liquidcollective'];

  const productTypeHashes = {};
  for (const productType of productTypes) {
    const protocolCoverHash = await uploadCoverWordingForProductType(ipfs, productType);
    productTypeHashes[productType] = protocolCoverHash;
  }

  const productTypeIpfsHashesPath = path.join(__dirname, 'v2-migration/output/productTypeIpfsHashes.json');

  fs.writeFileSync(productTypeIpfsHashesPath, JSON.stringify(productTypeHashes, null, 2), 'utf8');
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
