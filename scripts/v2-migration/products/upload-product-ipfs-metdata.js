require('dotenv').config();
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { parse: csvParse } = require('csv-parse/sync');

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
  const agreementBuffer = await readFileFromURL(url);

  console.log(`Uploading ${productType} cover wording to IPFS..`);
  const agreement = await ipfs.add(agreementBuffer);

  console.log('Uploading Agreement reference + title.');
  const protocolCover = await ipfs.add(
    Buffer.from(
      JSON.stringify({
        agreement: agreement.path,
        title: 'Protocol cover',
      }),
    ),
  );
  const productTypeHash = protocolCover.path;

  console.log(`Pinning ${productTypeHash}`);
  await ipfs.pin.add(productTypeHash);

  console.log(`Succesfully pinned`);
  return productTypeHash;
}

/**
   Expected format:

 Exclusions that apply but are not limited to:
 - Losses due to a compromised wallet;
 - Losses due to a previously disclosed vulnerability;
 */
function parseExtensions(extensionsText) {
  const extensions = extensionsText.split('-');
  // check it starts with the same prefix all the time
  console.assert(extensions[0] === 'Exclusions that apply but are not limited to: ', 'Bad prefix for extension text');
  extensions.shift();
  return extensions.map(e => e.trim().replace(';', ''));
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

  console.log(`Uploading Product IPFS metadata..`);

  const V2OnChainProductInfoProductsPath = path.join(__dirname, 'input/V2 Onchain Product Info - Products.csv');
  const productInfoRecords = csvParse(fs.readFileSync(V2OnChainProductInfoProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  });

  const productHashes = {};

  // TODO: we need to process all products and add name (?)
  // not just those in the sheet. + map it to new product v2 ID
  for (const record of productInfoRecords) {
    const data = {
      name: record.name,
    };

    const ipfsData = record['IPFS data'];
    if (ipfsData.length > 0) {
      data.extensions = parseExtensions(ipfsData);
    }

    const ipfsUpload = await ipfs.add(Buffer.from(JSON.stringify(data)));

    console.log(`Pinning ${ipfsUpload.path}`);
    await ipfs.pin.add(ipfsUpload.path);

    // TODO: get the productId here
    productHashes[record.address] = ipfsUpload.path;
  }
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
