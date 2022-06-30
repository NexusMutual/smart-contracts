const { artifacts, config, network, run, web3 } = require('hardhat');
const etherscanApiKey = 'UKHU7A2HJMUUMAHBIMGEMU1G22N46FZA7K';

const Verifier = require('../lib/verifier');
const Gateway = artifacts.require('Gateway');
const Quotation = artifacts.require('Quotation');

async function main () {
  // make sure the contracts are compiled and we're not deploying an outdated artifact
  await run('compile');

  console.log(`Using network: ${network.name}`);
  console.log('Network config:', config.networks[network.name]);

  const verifier = new Verifier(web3, etherscanApiKey, network.name);

  // deploy external contracts
  console.log('Deploying Quotation');
  const quotation = await Quotation.new();

  verifier.add(quotation, {
    constructorArgs: [],
    fullPath: 'contracts/modules/cover/Quotation.sol:Quotation',
  });

  console.log('Performing verifications');
  await verifier.submit();

  console.log('Done!');
}

main().catch(error => {
  console.error('An unexpected error encountered:', error);
  process.exit(1);
});
