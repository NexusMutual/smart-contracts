require('dotenv').config();
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { parse: csvParse } = require('csv-parse/sync');

async function readFileFromURL(url) {
  const file = await fetch(url).then(x => x.buffer());
  return file;
}

const CoverWordings = {
  // protocol
  0: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f4c4cca088730ac54ccc_ProtocolCoverv1.0.pdf',
  // custodian
  1: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f4d7b378db634f0f9a9d_CustodyCoverWordingv1.0.pdf',
  // token
  2: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f475a1a2c7250a1e9697_YieldTokenCoverv1.0.pdf',
  // sherlock
  3: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d0f7c4f0864e48c46ad93c_SherlockExcessCoverv1.0.pdf',
  // eth2slashing
  4:
    'https://uploads-ssl.webflow.com/' +
    '62d8193ce9880895261daf4a/63d0f8390352b0dc1cb8112b_ETH2-Staking-Cover-Wording-v1.0.pdf',
  // liquidcollective
  5: 'https://uploads-ssl.webflow.com/62d8193ce9880895261daf4a/63d7cb35dea9958c3952e9c0_Liquid-Collective-v1.0.pdf',
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
  const productTypeHash = agreement.path;

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
  const extensions = extensionsText.split('\n');
  return extensions.map(e => e.trim());
}

const main = async () => {
  const ipfs = ipfsClient({
    url: IPFS.API.url,
  });

  // using product type IDs
  const productTypes = [0, 1, 2, 3, 4, 5];

  const productTypeHashes = {};
  for (const productType of productTypes) {
    const protocolCoverHash = await uploadCoverWordingForProductType(ipfs, productType);
    productTypeHashes[productType] = protocolCoverHash;
  }

  const productTypeIpfsHashesPath = path.join(__dirname, 'output/product-type-ipfs-hashes.json');

  fs.writeFileSync(productTypeIpfsHashesPath, JSON.stringify(productTypeHashes, null, 2), 'utf8');

  console.log(`Uploading Product IPFS metadata..`);

  const V2OnChainProductInfoProductsPath = path.join(__dirname, 'input/product-data.csv');
  const productInfoRecords = csvParse(fs.readFileSync(V2OnChainProductInfoProductsPath, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }).slice(1); // eliminate the header of the CSV

  const v2ProductAddressesPath = path.join(__dirname, 'output/v2ProductAddresses.json');
  const v2ProductAddresses = JSON.parse(fs.readFileSync(v2ProductAddressesPath)).map(a => a.toLowerCase());

  const productHashes = {};

  for (const record of productInfoRecords) {
    const ipfsData = record['IPFS data'];

    console.log({
      record,
    });
    if (ipfsData.length === 0) {
      continue;
    }

    const data = {
      exclusions: parseExtensions(ipfsData),
    };

    const productAddress = record['Product Address '];
    const productName = record.Name;

    const v2Id = v2ProductAddresses.indexOf(productAddress.toLowerCase());

    if (v2Id < 0) {
      throw new Error(`Id for product ${productName} not found.`);
    }

    console.log(`Uploading IPFS data for product ${productName} with V2 Id: ${v2Id}`);

    const ipfsUpload = await ipfs.add(Buffer.from(JSON.stringify(data)));

    console.log(`Pinning ${ipfsUpload.path}`);
    await ipfs.pin.add(ipfsUpload.path);

    productHashes[v2Id] = ipfsUpload.path;
  }

  const productIpfsHashesPath = path.join(__dirname, 'output/product-ipfs-hashes.json');

  fs.writeFileSync(productIpfsHashesPath, JSON.stringify(productHashes, null, 2), 'utf8');
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
