require('dotenv').config();

const { web3 } = require('hardhat');
const path = require('path');
const Verifier = require('../lib/verifier');
const { getNetwork } = require('../lib/helpers');

const usage = exitcode => {
  const app = path.basename(process.argv[1]);
  console.log(`Usage:`);
  console.log(`    ${app} <target_contract> <depoyedAt>`);
  process.exit(exitcode);
};

async function main () {

  const targetContract = process.argv[2];
  const deployedAt = process.argv[3];

  if (!targetContract || !deployedAt) {
    console.log(`Missing required argument`);
    usage(1);
  }

  if (!deployedAt.match(/^0x[a-f0-9]{40}$/i)) {
    console.log(`Invalid address: ${deployedAt}`);
    usage(2);
  }

  const etherscanApiKey = process.env.ETHERSCAN_API_KEY;
  const network = await getNetwork();
  const verifier = new Verifier(web3, etherscanApiKey, network.toLowerCase());

  verifier.add(targetContract, deployedAt);
  console.log('Contract addresses to be verified:', verifier.dump());

  await verifier.submit();

  console.log('Verification finished');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
