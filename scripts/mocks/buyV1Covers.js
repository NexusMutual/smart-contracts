const { config, network, ethers } = require('hardhat');
const { CONTRACTS_ADDRESSES: Addresses } = require(process.env.CONFIG_FILE);

function zeroPadRight(bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  const ETH = zeroPadRight(Buffer.from('ETH'), 4);

  const quotationData = await ethers.getContractAt('TestnetQuotationData', Addresses.LegacyQuotationData);

  await quotationData.addV1Cover(
    30,
    123,
    owner.address, // owner
    ETH,
    '0x6354e79f21b56c11f48bcd7c451be456d7102a36', // scAddress
    0,
    0,
  );

  await quotationData.addV1Cover(
    30,
    123,
    owner.address, // owner
    ETH,
    '0x575409F8d77c12B05feD8B455815f0e54797381c', // scAddress
    0,
    0,
  );

  await quotationData.addV1Cover(
    30,
    123,
    owner.address, // owner
    ETH,
    '0x8B3d70d628Ebd30D4A2ea82DB95bA2e906c71633', // scAddress
    0,
    0,
  );

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
