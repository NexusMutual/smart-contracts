require('dotenv').config();
const ipfsClient = require('ipfs-http-client');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { parse: csvParse } = require('csv-parse/sync');

const IPFS_API_URL = 'https://api.nexusmutual.io/ipfs-api/api/v0';

// Input files
const PRODUCT_TYPE_DATA_PATH = path.join(__dirname, 'input/product-type-data.csv');
const PRODUCT_DATA_PATH = path.join(__dirname, 'input/product-data.csv');

// Output files
const PRODUCT_TYPE_IPFS_HASHES_PATH = path.join(__dirname, 'output/product-type-ipfs-hashes.json');
const PRODUCT_IPFS_HASHES_PATH = path.join(__dirname, 'output/product-ipfs-hashes.json');

const main = async () => {
  const ipfs = ipfsClient({ url: IPFS_API_URL });

  /* ----------------------------- Product Type ------------------------------ */

  console.log(`Uploading ProductType IPFS metadata`);

  const productTypeData = csvParse(fs.readFileSync(PRODUCT_TYPE_DATA_PATH, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }).slice(0); // eliminate the header of the CSV

  const productTypeHashes = {};
  for (const record of productTypeData) {
    console.log(record.Name);

    const productType = record.Id;
    const productTypeName = record.Name;
    const url = record['Cover Wording URL'];

    console.log(`Fetching ${productTypeName} cover wording from ${url}`);
    const agreementBuffer = await fetch(url).then(x => x.buffer());

    console.log(`Uploading ${productTypeName} cover wording to IPFS`);
    const agreement = await ipfs.add(agreementBuffer);
    const productTypeHash = agreement.path;

    console.log(`Pinning ${productTypeHash}`);
    await ipfs.pin.add(productTypeHash);

    productTypeHashes[productType] = productTypeHash;
  }

  fs.writeFileSync(PRODUCT_TYPE_IPFS_HASHES_PATH, JSON.stringify(productTypeHashes, null, 2), 'utf8');

  /* ------------------------------ Product -------------------------------- */

  console.log(`Uploading Product IPFS metadata`);

  const productData = csvParse(fs.readFileSync(PRODUCT_DATA_PATH, 'utf8'), {
    columns: true,
    skip_empty_lines: true,
  }).slice(0); // eliminate the header of the CSV

  const productAddressesPath = path.join(__dirname, 'output/product-addresses.json');
  const productAddresses = require(productAddressesPath).map(a => a.toLowerCase());

  const productHashes = {};

  for (const record of productData) {
    console.log(record.Name);

    const ipfsData = record['IPFS data'];
    if (ipfsData.length === 0) {
      continue;
    }

    const productName = record.Name;
    const productAddress = record['Product Address'];
    const productId = productAddresses.indexOf(productAddress.toLowerCase());
    if (productId < 0) {
      throw new Error(`Id for product ${productName} not found.`);
    }

    /*
      Expected format is an exclusion string on each newline, i.e.:
      ```
      Losses due to a compromised wallet
      Losses due to a previously disclosed vulnerability
      ```
    */
    const exclusionsData = {
      exclusions: ipfsData.split('\n').map(e => e.trim()),
    };
    console.log(`Uploading IPFS data for product ${productName} with product id: ${productId}`);
    const ipfsUpload = await ipfs.add(Buffer.from(JSON.stringify(exclusionsData)));

    console.log(`Pinning ${ipfsUpload.path}`);
    await ipfs.pin.add(ipfsUpload.path);

    productHashes[productId] = ipfsUpload.path;
  }

  fs.writeFileSync(PRODUCT_IPFS_HASHES_PATH, JSON.stringify(productHashes, null, 2), 'utf8');
};

if (require.main === module) {
  main(process.argv[1]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
