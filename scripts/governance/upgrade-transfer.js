const { ethers, network, nexus } = require('hardhat');

const { read, waitForInput } = nexus.helpers;

const PROXY_ADDRESS = '0xcafea2c575550512582090AA06d0a069E7236b9e';
const IMPLEMENTATION_ADDRESS = '0xcafeaC64cBE73e6e8973b52cDAE8982DE6Fb500E';
const ADVISORY_BOARD_MULTISIG = '0x51ad1265C8702c9e96Ea61Fe4088C2e22eD4418e';

async function main() {
  const create1PrivateKey = await read('Enter the private key of the account that will deploy the contract: ');
  const deployer = new ethers.Wallet(create1PrivateKey, ethers.provider);
  const proxy = await ethers.getContractAt('UpgradeableProxy', PROXY_ADDRESS, deployer);

  const baseFee = ethers.parseUnits('5', 'gwei');
  const maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');
  const maxFeePerGas = baseFee + maxPriorityFeePerGas;

  console.log(`Calling ${process.env.ACTION} transaction on ${PROXY_ADDRESS} on ${network.name}`);
  await waitForInput('Press enter to continue...');
  let tx;

  if (process.env.ACTION === 'upgrade') {
    tx = await proxy.upgradeTo(IMPLEMENTATION_ADDRESS, { maxFeePerGas, maxPriorityFeePerGas });
  }

  if (process.env.ACTION === 'transfer') {
    tx = await proxy.transferProxyOwnership(ADVISORY_BOARD_MULTISIG, { maxFeePerGas, maxPriorityFeePerGas });
  }

  if (!tx) {
    console.error('No action specified');
    process.exit(1);
  }

  console.log(`Waiting for transaction to be mined: https://etherscan.io/tx/${tx.hash}`);
  await tx.wait();
  console.log('Done!');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
