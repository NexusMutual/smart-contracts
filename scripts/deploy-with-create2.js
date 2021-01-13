require('dotenv').config();

const path = require('path');
const Web3 = require('web3');
const { getenv, init } = require('../lib/env');

const usage = exitcode => {
  const app = path.basename(process.argv[1]);
  console.log('Usage:');
  console.log(`    ${app} find hexPrefix [startSalt]`);
  console.log(`    ${app} deploy salt`);
  process.exit(exitcode);
};

const findCreate2Salt = web3 => function * (creatorAddress, bytecode, searchString, startSalt = 0) {

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

async function run () {

  const targetContract = process.env.TARGET_CONTRACT;
  const nonce = process.env.NONCE || undefined;

  const command = process.argv[2];
  const searchString = process.argv[3] || '';
  let startSalt = process.argv[4] || 0;

  if (!command.match(/^(find|deploy)$/i)) {
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

  startSalt /= 1; // cast to Number

  const { loader, network, provider } = await init();
  const factoryAddress = getenv(`${network}_FACTORY_ADDRESS`);
  const web3 = new Web3(provider);
  const saltGenerator = findCreate2Salt(web3);

  if (!factoryAddress) {
    console.log('No deployer address set!');
    process.exit(1);
  }

  const Target = loader.fromArtifact(targetContract);
  const Deployer = loader.fromArtifact('Deployer');
  const deployer = await Deployer.at(factoryAddress);

  console.log(`Deployer at address: ${deployer.address}`);
  console.log(`Target contract: ${targetContract}`);

  const { _json: { bytecode } } = Target;
  const getSalt = saltGenerator(deployer.address, bytecode, searchString, startSalt);

  if (command === 'find') {
    return find(getSalt, searchString, startSalt);
  }

  const { address, salt } = getSalt.next().value;

  console.log(`Using nonce: ${nonce}`);
  console.log(`Using salt: ${salt}`);
  console.log(`Computed address: ${address}`);

  const { tx } = await deployer.deploy(bytecode, salt, { nonce });

  const subdomain = network === 'MAINNET' ? '' : `${network.toLowerCase()}.`;
  console.log(`TX: https://${subdomain}etherscan.io/tx/${tx}`);
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
