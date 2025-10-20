const fs = require('node:fs');
const path = require('node:path');

const { ethers } = require('hardhat');
const { addresses } = require('@nexusmutual/deployments');

const COVER_BOUGHT_FIRST_BLOCK = 22482244;
const CHUNK_SIZE = 10000;

/* eslint-disable max-len */
const COVER_ABI = [
  'function getCoverData(uint256 coverId) external view returns (tuple(uint24 productId, uint8 coverAsset, uint96 amount, uint32 start, uint32 period, uint32 gracePeriod, uint16 rewardsRatio, uint16 capacityRatio))',
  'function multicall(bytes[] calldata data) external returns (bytes[] memory results)',
  'event CoverBought(uint256 indexed coverId, uint256 indexed originalCoverId, uint256 productId, address indexed buyer, string ipfsMetadata)',
];
/* eslint-disable max-len */

async function getCoverIpfsData(cover, fromBlock, toBlock) {
  console.log(`Scanning events from block ${fromBlock} to ${toBlock}...`);
  const coverIpfsMetadata = [];

  for (let start = fromBlock; start <= toBlock; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE - 1, toBlock);

    const events = await cover.queryFilter(cover.filters.CoverBought(), start, end);
    const data = events.map(e => ({ coverId: Number(e.args.coverId), ipfsMetadata: e.args.ipfsMetadata }));
    coverIpfsMetadata.push(...data);
    console.log(`Found ${events.length} events in blocks ${start} to ${end}`);
  }

  return coverIpfsMetadata;
}

async function main() {
  console.log('Scanning for active cover IPFS data...');

  const cover = new ethers.Contract(addresses.Cover, COVER_ABI, ethers.provider);
  const latestBlock = await ethers.provider.getBlockNumber();

  const coverIpfsMetadata = await getCoverIpfsData(cover, COVER_BOUGHT_FIRST_BLOCK, latestBlock);
  console.log(`Found ${coverIpfsMetadata.length} CoverBought events`);

  const callData = coverIpfsMetadata.map(data => cover.interface.encodeFunctionData('getCoverData', [data.coverId]));
  const coverDataResults = await cover.multicall.staticCall(callData);

  const now = Math.floor(Date.now() / 1000);
  const result = { coverIds: [], ipfsMetadata: [] };

  for (let i = 0; i < coverIpfsMetadata.length; i++) {
    const { coverId, ipfsMetadata } = coverIpfsMetadata[i];
    const [coverData] = cover.interface.decodeFunctionResult('getCoverData', coverDataResults[i]);
    const expiresAt = Number(coverData.start) + Number(coverData.period) + Number(coverData.gracePeriod);

    // only include covers that is still active / within gracePeriod + non empty ipfsMetadata
    if (now < expiresAt && ipfsMetadata) {
      result.coverIds.push(coverId);
      result.ipfsMetadata.push(ipfsMetadata);
    }
  }

  console.log(`\nFound ${result.coverIds.length} active covers with non-empty ipfsMetadata`);

  const outputFile = path.join(__dirname, 'data', 'cover-ipfs-metadata.json');
  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

  console.log(`\nOutput: ${outputFile}`);

  return result;
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
