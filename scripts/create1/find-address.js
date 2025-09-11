import { Wallet, getCreateAddress } from 'ethers';

async function main() {
  const targetPrefix = 'cafea';
  let tries = 0;

  while (true) {
    const wallet = Wallet.createRandom();
    const deployer = wallet.address;
    const addr = getCreateAddress({ from: deployer, nonce: 0 });
    tries++;

    if (addr.slice(2, 2 + targetPrefix.length).toLowerCase() === targetPrefix) {
      console.log('Found matching deployer!');
      console.log('Deployer:', deployer);
      console.log('PrivateKey:', wallet.privateKey);
      console.log('Contract Address:', addr);
      console.log('Tries:', tries);
      break;
    }

    if (tries % 100 === 0) {
      process.stdout.write(`\rTried ${tries} addresses...`);
    }

    if (tries >= 500000) {
      console.log('\nNo matching address found after 500,000 attempts. Exiting...');
      process.exit(1);
    }
  }
}

main();
