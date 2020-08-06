const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const { sleep, to } = require('./helpers');
const flatten = require('truffle-flattener');

const ETHERSCAN_SUBDOMAIN = {
  mainnet: 'api',
  rinkeby: 'api-rinkeby',
  ropsten: 'api-ropsten',
  kovan: 'api-kovan',
  goerli: 'api-goerli',
};

class Verifier {

  constructor (web3, apiKey, network) {
    this.web3 = web3;
    this.apiKey = apiKey;
    this.network = network;
    this.root = path.normalize(path.join(__dirname, '..'));
    this.addresses = {};
    this.artifacts = {};
    this.sources = {};
  }

  add (name, address, argTypes, argValues) {

    if (!this.addresses[name]) {
      const artifactPath = path.join(this.root, 'build/contracts', `${name}.json`);
      const json = fs.readFileSync(artifactPath).toString();
      this.artifacts[name] = JSON.parse(json);
      this.addresses[name] = new Set();
      this.flatten(name);
    }

    const constructorArgs = argTypes && argTypes.length
      ? this.web3.eth.abi.encodeParameters(argTypes, argValues)
      : null;

    this.addresses[name].add({ address, constructorArgs });
  }

  flatten (contractName) {
    const { sourcePath } = this.artifacts[contractName];
    // get promise without awaiting it so it will run in background
    this.sources[contractName] = flatten([sourcePath], this.root);
  }

  dump () {
    return Object.keys(this.addresses).reduce((list, name) => ({
      ...list,
      [name]: [...this.addresses[name]].map(c => c.address),
    }), {});
  }

  async submit () {

    const results = [];

    for (const contractName of Object.keys(this.addresses)) {

      const { compiler } = this.artifacts[contractName];
      const { version: compilerVersion } = compiler;
      const { enabled: optimizer, runs: optimizerRuns } = compiler.optimizer;

      const contractSource = await this.sources[contractName];
      fs.writeFileSync(path.join(this.root, 'flat', `${contractName}.sol`), contractSource);

      for (const details of this.addresses[contractName]) {

        const { address: contractAddress, constructorArgs } = details;
        console.log(details);

        const args = {
          contractAddress,
          contractSource,
          contractName,
          constructorArgs,
          compilerVersion,
          optimizer,
          optimizerRuns,
        };

        const [, verifyError] = await to(this.verify(args));

        if (verifyError) {
          console.log(`Failed to verify ${contractName} @ ${contractAddress}`);
          console.log('Error:', verifyError.stack);
          throw verifyError;
        }

        results.push({ contractName, contractAddress });
      }
    }

    return results;
  }

  async verify (params) {

    const {
      contractAddress,
      contractName,
      contractSource,
      constructorArgs,
      compilerVersion,
      optimizer,
      optimizerRuns,
    } = params;

    const apikey = this.apiKey;
    const network = this.network;

    if (!ETHERSCAN_SUBDOMAIN[network]) {
      throw new Error(`Unknown network ${network}`);
    }

    const apiSubdomain = ETHERSCAN_SUBDOMAIN[network];
    const etherscanApiUrl = `https://${apiSubdomain}.etherscan.io/api`;

    // drop suffix and prefix with `v`:
    // 0.5.7+commit.6da8b019.Emscripten.clang -> 0.5.7+commit.6da8b019
    const compilerRegex = /^(\d+\.\d+\.\d+\+commit\.[0-9a-f]{8}).*$/;
    const compiler = compilerVersion.replace(compilerRegex, 'v$1');

    // drop 0x prefix
    const constructorArguements = (constructorArgs || '').replace(/^0x/, '');

    const method = 'POST';
    const headers = { 'Content-type': 'application/x-www-form-urlencoded' };
    const data = {
      apikey,
      module: 'contract',
      action: 'verifysourcecode',
      contractaddress: contractAddress,
      contractname: contractName,
      sourceCode: contractSource,
      constructorArguements,
      compilerversion: compiler,
      optimizationUsed: optimizer ? 1 : 0,
      runs: optimizerRuns,
    };

    const fetchOptions = { method, headers, body: new URLSearchParams(data).toString() };
    let attempts = 5;

    while (true) {

      const response = await fetch(etherscanApiUrl, fetchOptions);
      const responseBody = await response.json();
      const { status, message, result } = responseBody;

      // etherscan didn't see the contract code yet, retry in 5 seconds
      if (
        typeof result === 'string' &&
        result.startsWith('Unable to locate ContractCode') &&
        --attempts > 0
      ) {
        await sleep(10000);
        continue;
      }

      if (response.status !== 200 || status !== '1') {
        throw new Error(`Verification failed: status=${status}, message=${message}, result=${result}`);
      }

      return responseBody;
    }
  }

}

module.exports = Verifier;
