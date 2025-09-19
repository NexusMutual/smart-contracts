const { SigningKey, Wallet, getCreateAddress, randomBytes } = require('ethers');

function main() {
  const targetPrefix = (process.argv[2] || 'cafea').toLowerCase();
  let tries = 0;

  while (true) {
    ++tries;

    const key = new SigningKey(randomBytes(32));
    const deployer = new Wallet(key);
    const addr = getCreateAddress({ from: deployer.address, nonce: 0 });

    if (addr.slice(2, 2 + targetPrefix.length).toLowerCase() === targetPrefix) {
      console.log(`\rContract ${addr} | Deployer ${deployer.address} | Private key ${key.privateKey}`);
    }

    if (tries % 100 === 0) {
      process.stdout.write(`\rTried ${tries} addresses...`);
    }
  }
}

main();
