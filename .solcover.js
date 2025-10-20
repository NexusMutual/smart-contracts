const fs = require('fs');
const path = require('path');

const { artifacts, config } = require('hardhat');
const { keccak256 } = require('ethereum-cryptography/keccak');
const { bytesToHex, hexToBytes } = require('ethereum-cryptography/utils');

const stakingLibraryPath = 'contracts/libraries/StakingPoolLibrary.sol';

function findFiles(dir) {
  const results = [];

  for (const filename of fs.readdirSync(dir)) {
    const filepath = path.join(dir, filename);
    const stat = fs.statSync(filepath);
    const fileOrContents = stat && stat.isDirectory() ? findFiles(filepath) : [filepath];
    results.push(...fileOrContents);
  }

  return results;
}

async function onCompileComplete() {
  const { bytecode } = await artifacts.readArtifact('MinimalBeaconProxy');
  const requiredHash = bytesToHex(keccak256(hexToBytes(bytecode.replace(/^0x/i, ''))));

  const stakingLibrary = fs.readFileSync(stakingLibraryPath, 'utf8').toString();
  const hardcodedHash = stakingLibrary.match(/hex'([0-9a-f]+)' \/\/ init code hash/i)[1];

  console.log('Required hash:', requiredHash);
  console.log('Hardcoded hash:', hardcodedHash);

  if (hardcodedHash === requiredHash) {
    console.log('Artifact patching not required');
    return;
  }

  const files = findFiles(config.paths.artifacts);
  const foundArtifacts = files.filter(file => file.match(/\.json/));

  for (const file of foundArtifacts) {
    const contents = fs.readFileSync(file, 'utf8').toString();
    if (contents.includes(hardcodedHash)) {
      console.log(`Patching ${file}`);
      fs.writeFileSync(file, contents.replace(hardcodedHash, requiredHash), 'utf8');
    }
  }
}

module.exports = {
  mocha: { parallel: false },
  onCompileComplete,
  skipFiles: [
    'abstract/',
    'external/',
    'interfaces/',
    'libraries/',
    'mocks/',
    'modules/cover/CoverViewer.sol',
    'modules/governance/external',
    'modules/legacy',
    'modules/staking/StakingViewer.sol',
    'modules/token/external',
    'utils/',
  ],
  providerOptions: {
    default_balance_ether: 1000000000,
  },
};
