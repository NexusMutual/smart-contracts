const { artifacts, run } = require('hardhat');
const path = require('path');
const { toChecksumAddress, keccak256 } = require('ethereumjs-util');

const { getNetwork, waitForInput } = require('../lib/helpers');

const usage = exitcode => {
  const app = path.basename(process.argv[1]);
  console.log(`Usage:`);
  console.log(`    ${app} find hexPrefix [startSalt]`);
  console.log(`    ${app} deploy salt`);
  process.exit(exitcode);
};

const findCreate2Salt = () => function * (creatorAddress, bytecode, searchString, startSalt = 0) {

  const creator = creatorAddress.slice(-40);
  const bytecodeBuffer = Buffer.from(bytecode.slice(2), 'hex');
  const bytecodeHash = keccak256(bytecodeBuffer).toString('hex').replace(/^0x/, '');

  let message;

  for (let salt = startSalt; salt < 72057594037927936; salt++) {

    if (salt % 1000 === 0) {
      message = `\rTrying salt ${salt}...`;
      process.stdout.write(message);
    }

    const saltHex = salt.toString(16).padStart(64, '0');
    const input = Buffer.from(`ff${creator}${saltHex}${bytecodeHash}`, 'hex');
    const create2Hash = keccak256(input);
    const address = create2Hash.slice(32 - 20).toString('hex');

    if (address.startsWith(searchString)) {
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

  console.log(`
    Heads up! I have a memory leak and will eat a lot of RAM!
    Keep an eye on the available memory and kill me when needed.
    You'll be able to resume from the last found salt by passing it as a cli argument.
  `);

  await waitForInput('Press enter to continue...');

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
    console.log(`TARGET_CONTRACT env var is required`);
    usage(3);
  }

  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  startSalt /= 1; // cast to Number

  const network = (await getNetwork()).toUpperCase();
  const factoryAddress = process.env[`${network}_FACTORY_ADDRESS`];
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

  const { _json: { bytecode } } = Target;
  const getSalt = saltGenerator(deployer.address, bytecode, searchString, startSalt);

  if (command === 'find') {
    return find(getSalt, searchString, startSalt);
  }

  const { address, salt } = getSalt.next().value;

  const nonce = process.env.NONCE;
  const gas = process.env.GAS_LIMIT;

  nonce && console.log(`Using nonce: ${nonce}`);
  gas && console.log(`Gas: ${gas}`);

  console.log(`Using salt: ${salt}`);
  console.log(`Computed address: ${address}`);

  if (network === 'MAINNET') {
    console.log('Are you sure you want to deploy to MAINNET?');
    await waitForInput('Press enter to continue...');
  }

  console.log('Sending tx...');
  const { tx } = await deployer.deploy(bytecode, salt, { gas, nonce });

  const subdomain = network === 'MAINNET' ? '' : `${network.toLowerCase()}.`;
  console.log(`TX: https://${subdomain}etherscan.io/tx/${tx}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
