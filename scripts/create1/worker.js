const workerpool = require('workerpool');
const { SigningKey, Wallet, getCreateAddress, randomBytes } = require('ethers');

const worker = (config, batchSize) => {
  const results = [];

  for (let i = 0; i < batchSize; i++) {
    const key = new SigningKey(randomBytes(32));
    const deployer = new Wallet(key);
    const contractAddress = getCreateAddress({ from: deployer.address, nonce: 0 });

    const addressToCheck = config.ignoreCase ? contractAddress.slice(2).toLowerCase() : contractAddress.slice(2);
    const searchText = config.ignoreCase ? config.search.toLowerCase() : config.search;

    if (addressToCheck.startsWith(searchText)) {
      results.push({
        contractAddress,
        deployerAddress: deployer.address,
        privateKey: key.privateKey,
      });
    }
  }

  return results;
};

workerpool.worker({ worker });
