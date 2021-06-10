const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const { sleep, to } = require('./helpers');

function ensureDirectoryExistence (filePath) {
  var dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

class Verifier {

  constructor (web3, apiKey, network) {
    this.web3 = web3;
    this.apiKey = apiKey;
    this.network = network;
    this.root = path.normalize(path.join(__dirname, '..'));
    this.addresses = {};
    this.sources = {};
  }

  add (instance, { alias, constructorArgs: values, fullPath } = {}) {

    const { address, constructor } = instance;
    const { contractName: name } = constructor._json;

    const constructorArguments = values;

    if (!this.addresses[name]) {
      this.addresses[name] = new Set();
    }

    this.addresses[name].add({ address, alias, constructorArguments, fullPath });
  }

  dump (deployDataFile) {

    const deployData = Object.keys(this.addresses).reduce((list, name) => ({
      ...list,
      [name]: [...this.addresses[name]].map(({ address, alias }) => ({
        address,
        name: alias || name,
        proxy: !!alias,
      })),
    }), {});

    ensureDirectoryExistence(deployDataFile);
    fs.writeFileSync(
      deployDataFile,
      JSON.stringify(deployData, null, 2),
      'utf8',
    );

    console.log(`Deploy info written to ${path.normalize(deployDataFile)}`);
  }

  async submit () {

    const results = [];

    for (const contractName of Object.keys(this.addresses)) {

      for (const details of this.addresses[contractName]) {
        const { address, constructorArguments, fullPath } = details;
        const [, verifyError] = await to(this.verify(contractName, address, constructorArguments, fullPath));

        if (verifyError) {
          console.log(`Failed to verify ${contractName} @ ${address}`);
          console.log('Error:', verifyError.stack);
        }

        results.push({ contractName, address });
      }
    }

    return results;
  }

  async verify (contractName, contractAddress, constructorArguments, fullPath) {

    let attempts = 5;

    console.log(`Verifying ${contractName} @ ${contractAddress}`);

    while (true) {
      const [, verifyError] = await to(hre.run('verify:verify', {
        contract: fullPath,
        address: contractAddress,
        constructorArguments,
      }));

      if (verifyError) {
        --attempts;
        console.error(`Verify failed. ${verifyError}. Attempts left: ${attempts}`);
        if (attempts > 0) {
          await sleep(10000);
          continue;
        }
      } else {
        break;
      }

      throw new Error(`Verification failed: ${verifyError}`);
    }
  }

}

module.exports = Verifier;
