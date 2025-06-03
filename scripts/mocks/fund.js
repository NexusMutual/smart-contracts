const { network, ethers } = require('hardhat');

const { formatEther, parseEther } = ethers;

// this hex function produces evm-compatible hex strings:
// - strips leading zeroes (0x01 -> 0x1)
// - keeps one zero if the value is zero (0x00 -> 0x0)
const hex = n => ethers.toBeHex(n);

const send = ethers.provider.send.bind(ethers.provider);

const tests = [
  { node: 'hardhat', regex: /HardhatNetwork/ },
  { node: 'tenderly', regex: /Tenderly/ },
];

async function main() {
  console.log(`Using network: ${network.name}`);

  const charities = process.argv.slice(2);
  const invalidAddresses = charities.filter(charity => !ethers.isAddress(charity));

  if (invalidAddresses.length > 0) {
    console.log(`Invalid addresses: ${invalidAddresses.join(', ')}`);
    process.exit(2);
  }

  const clientVersion = await send('web3_clientVersion', []);
  const test = tests.find(test => test.regex.test(clientVersion));

  if (test === undefined) {
    console.log('Error: Can only fund accounts on hardhat or tenderly');
    process.exit(3);
  }

  const { node } = test;
  const setBalance = async (account, value) => send(`${node}_setBalance`, [account, hex(value)]);
  const amount = ethers.parseEther('100');

  for (const charity of charities) {
    console.log(`Funding ${charity} with ${formatEther(amount)} ETH`);
    await setBalance(charity, amount);
  }

  console.log('Done!');
  process.exit(0);
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
