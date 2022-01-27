const { artifacts, run, web3 } = require('hardhat');
const path = require('path');
const { toChecksumAddress, keccak256 } = require('ethereumjs-util');

const { getNetwork, waitForInput } = require('../lib/helpers');

const isMemoryOK = () => {
  const usage = process.memoryUsage();
  const limit = 4e+9; // 4GB
  return usage.rss < limit;
};

const usage = exitcode => {
  const app = path.basename(process.argv[1]);
  console.log('Usage:');
  console.log(`    ${app} find hexPrefix [startSalt]`);
  console.log(`    ${app} deploy salt`);
  process.exit(exitcode);
};

const findCreate2Salt = () => function * (creatorAddress, bytecode, searchString, startSalt = 0) {

  const creator = creatorAddress.slice(-40);
  const bytecodeBuffer = Buffer.from(bytecode.slice(2), 'hex');
  const bytecodeHash = keccak256(bytecodeBuffer).toString('hex').replace(/^0x/, '');
  const prefix = process.env.CS ? searchString : searchString.toLowerCase();

  let message;

  for (let salt = startSalt; salt < 72057594037927936; salt++) {

    if (salt % 1000 === 0) {
      message = `\rTrying salt ${salt}...`;
      process.stdout.write(message);
    }

    if (salt % 100000 === 0 && !isMemoryOK()) {
      message = `Memory limit hit! Next salt: ${salt}`;
      process.stdout.write(`\n${message}\n`);
      process.exit(5);
    }

    const saltHex = salt.toString(16).padStart(64, '0');
    const input = Buffer.from(`ff${creator}${saltHex}${bytecodeHash}`, 'hex');
    const create2Hash = keccak256(input);
    const address = create2Hash.slice(32 - 20).toString('hex');

    const checksummed = process.env.CS
      ? toChecksumAddress(`0x${address}`).slice(2)
      : address.toLowerCase();

    if (checksummed.startsWith(prefix)) {
      message && process.stdout.write(`\r${' '.repeat(message.length)}\r`);
      yield { address: toChecksumAddress(`0x${address}`), salt };
    }
  }
};

const find = saltGenerator => {
  while (true) {
    const {
      address,
      salt,
    } = saltGenerator.next().value;
    console.log(`Address: ${address}   Salt: ${salt}`);
  }
};

async function main () {

  const command = process.argv[2];
  const searchString = (process.argv[3] || '').replace(/^0x/, '');
  let startSalt = process.argv[4] || 0;

  if (!command || !command.match(/^(find|deploy)$/i)) {
    console.log(`Invalid command: ${command}`);
    usage(1);
  }

  if (!searchString.match(/^[a-f0-9]+$/i)) {
    console.log(`Invalid hex string: ${searchString}`);
    usage(2);
  }

  if (typeof startSalt === 'string' && !startSalt.match(/^[0-9]+$/)) {
    console.log(`Invalid salt: ${startSalt}`);
    usage(3);
  }

  const targetContract = process.env.TARGET_CONTRACT;

  if (typeof targetContract !== 'string') {
    console.log('TARGET_CONTRACT env var is required');
    usage(3);
  }

  if (!process.env.ENABLE_OPTIMIZER) {
    console.log('In order to deploy you need to enable optimizer using ENABLE_OPTIMIZER=1');
    process.exit(4);
  }

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  startSalt /= 1; // cast to Number

  const network = await getNetwork();
  const factoryAddress = process.env[`${network.toUpperCase()}_FACTORY_ADDRESS`];
  const saltGenerator = findCreate2Salt();

  if (!factoryAddress) {
    console.log('No deployer address set!');
    process.exit(1);
  }

  const Deployer = artifacts.require('Deployer');
  const deployer = await Deployer.at(factoryAddress);
  console.log(`Deployer at address: ${deployer.address}`);

  const Target = artifacts.require(targetContract);
  console.log(`Target contract: ${targetContract}`);

  let constructor = '';

  if (typeof process.env.C_ARGS !== 'undefined') {

    const constructorArgs = JSON.parse(process.env.C_ARGS || 'null');
    const constructorArgTypes = JSON.parse(process.env.C_ARG_TYPES || 'null');
    constructor = web3.eth.abi.encodeParameters(constructorArgTypes, constructorArgs).slice(2);

    console.log(`Constructor arguments:         ${process.env.C_ARGS}`);
    console.log(`Constructor arguments types:   ${process.env.C_ARG_TYPES}`);
    console.log(`Encoded constructor arguments: ${constructor}`);
  }

  const { _json: { bytecode: rawBytecode } } = Target;
  let contractBytecode = rawBytecode;

  if (process.env.LINK) {
    let [search, replace] = process.env.LINK.split(':');
    replace = replace.replace(/^0x/, '');
    console.log(`Linking ${search} -> ${replace}`);
    contractBytecode = contractBytecode.split(search).join(replace);
  }

  const bytecode = `${contractBytecode}${constructor}`;
  const getSalt = saltGenerator(deployer.address, bytecode, searchString, startSalt);

  if (command === 'find') {
    return find(getSalt, searchString, startSalt);
  }

  const { address, salt } = getSalt.next().value;

  const nonce = parseInt(process.env.NONCE, 10) || undefined;
  const gas = parseInt(process.env.GAS_LIMIT, 10) || undefined;
  const gasPrice = parseInt(process.env.GAS_PRICE, 10) || undefined;

  nonce && console.log(`Using nonce: ${nonce}`);
  gas && console.log(`Gas: ${gas}`);
  gasPrice && console.log(`Gas price: ${gasPrice}`);

  console.log(`Using salt: ${salt}`);
  console.log(`Computed address: ${address}`);

  if (network === 'mainnet') {
    console.log('Are you sure you want to deploy to MAINNET?');
    await waitForInput('Press enter to continue...');
  }

  console.log('Sending tx...');
  const { tx } = await deployer.deploy(bytecode, salt, { gas, nonce, gasPrice: gasPrice * 1e9 });
  const receipt = await web3.eth.getTransactionReceipt(tx);

  const subdomain = network === 'mainnet' ? '' : network;
  console.log(`TX: https://${subdomain}etherscan.io/tx/${tx}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
