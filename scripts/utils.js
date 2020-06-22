const fs = require('fs');
const path = require('path');

const HDWalletProvider = require('@truffle/hdwallet-provider');
const { setupLoader } = require('@openzeppelin/contract-loader');

const init = async () => {

  const network = getenv('NETWORK');
  console.log(`Using ${network} network`);

  const account = getenv(`${network}_ACCOUNT`);
  const mnemonic = getenv(`${network}_MNEMONIC`);
  const providerURL = getenv(`${network}_PROVIDER_URL`);

  const provider = new HDWalletProvider(mnemonic, providerURL);

  const loader = setupLoader({
    provider,
    defaultSender: account,
    defaultGas: 1e6, // 1 million
    defaultGasPrice: 5e9, // 5 gwei
  }).truffle;

  return { account, provider, loader };
};

const deployerFactory = loader => async (contract, ...constructorArgs) => {

  const Contract = loader.fromArtifact(contract);

  // const gasEstimate = await Contract.new.estimateGas(...constructorArgs);
  // const gas = gasEstimate;
  const gas = 10e6;
  const instance = await Contract.new(...constructorArgs, { gas });

  console.log(`${contract} deployed at ${instance.address}`);

  return instance;
};

const proxyDeployerFactory = (loader, deploy) => async contract => {

  const implementation = await deploy(contract);
  const proxy = await deploy('OwnedUpgradeabilityProxy', implementation.address);
  const Contract = loader.fromArtifact(contract);

  return Contract.at(proxy.address);
};

const transferProxyOwnershipFactory = loader => async (proxyAddress, newOwnerAddress) => {
  const Proxy = loader.fromArtifact('OwnedUpgradeabilityProxy');
  const proxy = await Proxy.at(proxyAddress);
  await proxy.transferProxyOwnership(newOwnerAddress);
};

function getenv (key, fallback = undefined) {

  const value = process.env[key] || fallback;

  if (typeof value === 'undefined') {
    throw new Error(`Missing env var: ${key}`);
  }

  return value;
}

const getWeb3Utils = web3 => ({

  isContract: async address => {
    const code = await web3.eth.getCode(address);
    return code.slice(2).length > 0;
  },

  findCreate2Salt: function * (creatorAddress, bytecode, searchString, startSalt = 0) {

    const creator = creatorAddress.slice(-40);
    const bytecodeHash = web3.utils.sha3(bytecode).replace(/^0x/, '');
    let message;

    for (let salt = startSalt; salt < 72057594037927936; salt++) {

      if (salt % 1000 === 0) {
        message = `\rTrying salt ${salt}...`;
        process.stdout.write(message);
      }

      const saltHex = salt.toString(16).padStart(64, '0');
      const input = `0xff${creator}${saltHex}${bytecodeHash}`;
      const address = web3.utils.sha3(input).slice(-40);

      if (address.startsWith(searchString)) {
        message && process.stdout.write(`\r${' '.repeat(message.length)}\r`);
        yield { address: web3.utils.toChecksumAddress(`0x${address}`), salt };
      }
    }
  },

});

const updateOzConfig = addresses => {

  const network = getenv('NETWORK').toLowerCase();
  const file = path.join(process.cwd(), '.openzeppelin', `${network}.json`);
  let data;

  if (!fs.existsSync(file)) {
    data = { solidityLibs: {}, proxies: {}, manifestVersion: '2.2', version: '1.0.0' };
  } else {
    data = JSON.parse(fs.readFileSync(file).toString());
  }

  for (const contract of Object.keys(addresses)) {
    const key = `pooled-staking/${contract}`;
    const address = addresses[contract];
    data.proxies[key] = [{ address, kind: 'NonProxy' }];
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  console.log(`Config updated: .openzeppelin/${network}.json`);
};

module.exports = {
  init,
  deployerFactory,
  getenv,
  getWeb3Utils,
  proxyDeployerFactory,
  transferProxyOwnershipFactory,
  updateOzConfig,
};
