require('dotenv').config();
const path = require('node:path');

const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');

const { simulateTransaction, constants } = require('./helpers');
const fs = require('fs');
const { GOVERNANCE_ADDRESS, IPFS_API_URL, CATEGORY_PARAM_TYPES } = constants;

const ipfs = ipfsClient({ url: IPFS_API_URL });

const verifyDecodedTxInputs = (inputs, decodedTxInputs) => {
  if (decodedTxInputs[0] !== inputs[0]) {
    throw new Error(`Title mismatch: ${decodedTxInputs[0]} !== ${inputs[0]}`);
  }

  if (decodedTxInputs[1] !== inputs[1]) {
    throw new Error(`Short description mismatch: ${decodedTxInputs[1]} !== ${inputs[1]}`);
  }

  if (decodedTxInputs[2] !== inputs[2]) {
    throw new Error(`Ipfs hash mismatch: ${decodedTxInputs[2]} !== ${inputs[2]}`);
  }

  if (decodedTxInputs[3] !== inputs[3]) {
    throw new Error(`Category mismatch: ${decodedTxInputs[3]} !== ${inputs[3]}`);
  }

  if (decodedTxInputs[4] !== inputs[4]) {
    throw new Error(`Solution Hash mismatch: ${decodedTxInputs[4]} !== ${inputs[4]}`);
  }

  if (decodedTxInputs[5] !== inputs[5]) {
    throw new Error(`Action mismatch: ${decodedTxInputs[5]} !== ${inputs[5]}`);
  }
};

/**
 *
 * Generate the tx data for the Governance.createProposalWithSolution transaction using the provided proposal data
 *
 * @param proposalFilePath path for file of proposal data containing title, shortDescription, and description
 * @param categoryId category id for the proposal
 * @param actionParamsRaw action params for the proposal as stringified JSON
 * @param solutionHash hash of the solution for the proposal
 * @returns {Promise<{createProposalWithSolution: *}>}
 */
const main = async (proposalFilePath, categoryId, actionParamsRaw, solutionHash = '') => {
  const governance = await ethers.getContractAt('Governance', GOVERNANCE_ADDRESS);
  const [proposal] = require(path.resolve(proposalFilePath));
  const actionParams = JSON.parse(actionParamsRaw);

  // check for any missing required data before processing and uploading files to IPFS
  if (Object.keys(proposal).length > 3) {
    throw new Error('Proposal data should only contain title, shortDescription, and description');
  }

  if (!proposal.title) {
    throw new Error('Proposal title is required');
  }

  if (!proposal.shortDescription) {
    throw new Error('Proposal short description is required');
  }

  if (!proposal.description) {
    throw new Error('Proposal description is required');
  }

  if (!categoryId) {
    throw new Error('Category ID is required');
  }

  if (!actionParams) {
    throw new Error('Action is required');
  }

  if (CATEGORY_PARAM_TYPES[categoryId].length !== actionParams.length) {
    throw new Error(
      `Action Params length mismatch: ${CATEGORY_PARAM_TYPES[categoryId].length} !== ${actionParams.length}`,
    );
  }

  const encodedActionParams = ethers.utils.defaultAbiCoder.encode(CATEGORY_PARAM_TYPES[categoryId], actionParams);

  // upload proposal file to IPFS
  const file = await ipfs.add(fs.readFileSync(proposalFilePath));
  await ipfs.pin.add(file.path);

  // group the inputs for the createProposalWithSolution transaction
  const inputs = [proposal.title, proposal.shortDescription, file.path, categoryId, solutionHash, encodedActionParams];

  // create the transaction data for createProposalwithSolution
  const createProposalTransaction = await governance.populateTransaction.createProposalwithSolution(...inputs);
  console.log(`Tx data:\n${createProposalTransaction.data}`);

  // simulate the transaction
  const decodedTxInputs = await simulateTransaction(createProposalTransaction.data);

  // verify the decoded inputs match the inputs
  verifyDecodedTxInputs(inputs, decodedTxInputs);

  return createProposalTransaction;
};

if (require.main === module) {
  main(process.argv[2], process.argv[3], process.argv[4], process.argv[5]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
