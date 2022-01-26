require('dotenv').config();
const { config, network, run, ethers } = require('hardhat');

const { hex } = require('../lib/helpers');
const fs = require('fs');
const { parseUnits } = ethers.utils;

function zeroPadRight (bytes, length) {
  return new Uint8Array(length).fill(0).map((x, i) => bytes[i] || x);
}

async function main () {
  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const [owner] = await ethers.getSigners();
  const quotationData = await ethers.getContractAt(
    'TestnetQuotationData',
    '0xA51c1fc2f0D1a1b8494Ed1FE312d7C3a78Ed91C0',
  );

  const now = Math.floor(Date.now() / 1000);
  const ETH = zeroPadRight(Buffer.from('ETH'), 4);
  const DAI = zeroPadRight(Buffer.from('DAI'), 4);

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
    '0x6354e79f21b56c11f48bcd7c451be456d7102a36', // scAddress
    0,
    0,
  );

  await quotationData.addOldCover(
    now,
    30,
    123,
    owner.address, // owner
    ETH,
    '0x6354e79f21b56c11f48bcd7c451be456d7102a36', // scAddress
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
