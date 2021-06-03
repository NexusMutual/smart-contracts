const fetch = require('node-fetch');
const { artifacts, web3 } = require('hardhat');
const { ether } = require('@openzeppelin/test-helpers');
const { hex } = require('../test/utils/helpers');
const BN = web3.utils.BN;

const Distributor = artifacts.require('Distributor');

async function run () {

  const DISTRIBUTOR_ADDRESS = process.env.DISTRIBUTOR_ADDRESS;
  const coverId = process.env.COVER_ID;
  console.log({
    DISTRIBUTOR_ADDRESS,
  });
  const distributor = await Distributor.at(DISTRIBUTOR_ADDRESS);

  console.log(`Submitting claim..`);

  // no extra metdata added to claim submission
  const emptyData = web3.eth.abi.encodeParameters([], []);
  // execute the submit claim call
  const tx = await distributor.submitClaim(coverId, emptyData);

  const claimId = tx.logs[0].args.claimId.toString();
  console.log(`Submitted claim successfully. claim id: ${claimId}`);

  const { payoutCompleted, amountPaid, coverAsset } = await distributor.getPayoutOutcome(claimId);
  console.log({
    payoutCompleted,
    amountPaid: amountPaid.toString(),
    coverAsset
  })
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch(error => {
    console.error('An unexpected error encountered:', error);
    process.exit(1);
  });
