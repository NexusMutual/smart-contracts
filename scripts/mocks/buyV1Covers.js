const { config, network, ethers } = require('hardhat');

function zeroPadRight(bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

async function main() {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();

  const quotationData = await ethers.getContractAt(
    'TestnetQuotationData',
    '0xcf7ed3acca5a467e9e704c703e8d87f634fb0fc9',
  );

  const now = Math.floor(Date.now() / 1000);
  const ETH = zeroPadRight(Buffer.from('ETH'), 4);

  await quotationData.addOldCover(
    now - 365 * 24 * 60 * 60,
    30,
    123,
    owner.address, // owner
    ETH,
    '0x6354e79f21b56c11f48bcd7c451be456d7102a36', // scAddress
    0,
    0,
  );

  await quotationData.addOldCover(
    now - 30 * 24 * 60 * 60,
    30,
    123,
    owner.address, // owner
    ETH,
    '0x575409F8d77c12B05feD8B455815f0e54797381c', // scAddress
    0,
    0,
  );

  await quotationData.addOldCover(
    now,
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
