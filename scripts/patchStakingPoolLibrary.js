const fs = require('fs');
const path = require('path');

const { artifacts, run, config } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');

const main = async () => {
  // run the initial compile task
  await run('compile');

  const targetContract = 'MinimalBeaconProxy';
  const targetLibrary = 'StakingPoolLibrary';

  const { bytecode: deploymentBytecode } = await artifacts.readArtifact(targetContract);
  const bytecode = hexToBytes(deploymentBytecode.replace(/^0x/i, ''));
  const bytecodeHash = bytesToHex(keccak256(bytecode)).toString('hex').replace(/^0x/i, '');

  // @fvictorio: source names are not paths but this works so who cares
  const { sourceName } = await artifacts.readArtifact(targetLibrary);
  const libraryPath = path.join(config.paths.root, sourceName);

  const code = fs.readFileSync(libraryPath).toString();
  const patched = code.replace(
    /hex'[a-f0-9]*' \/\/ init code hash/gi, // match
    `hex'${bytecodeHash}' // init code hash`, // replacement
  );

  fs.writeFileSync(libraryPath, patched);

  // recompile with changes
  await run('compile').catch(err => {
    fs.writeFileSync(libraryPath, code);
    console.log('Compilation failed. Changes reverted.');
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
};

if (require.main === module) {
  main()
    .then(() => console.log('Done!'))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
