// require('dotenv').config();
// const path = require('node:path');

// const { ethers } = require('hardhat');
// const ipfsClient = require('ipfs-http-client');

// const { simulateTransaction, constants } = require('./helpers');
// const fs = require('fs');
// const { GOVERNANCE_ADDRESS, IPFS_API_URL } = constants;

// const ipfs = ipfsClient({ url: IPFS_API_URL });

// const verifyDecodedTxInputs = (inputs, decodedTxInputs) => {
//   console.long(JSON.stringify({ decodedTxInputs0: decodedTxInputs[0], inputs0: inputs[0] }, null, 2));
//   if (decodedTxInputs[0] !== inputs[0]) {
//     throw new Error(`Title mismatch: ${decodedTxInputs[0]} !== ${inputs[0]}`);
//   }

//   console.long(JSON.stringify({ decodedTxInputs1: decodedTxInputs[1], inputs1: inputs[1] }, null, 2));
//   if (decodedTxInputs[1] !== inputs[1]) {
//     throw new Error(`Short description mismatch: ${decodedTxInputs[1]} !== ${inputs[1]}`);
//   }

//   console.long(JSON.stringify({ decodedTxInputs2: decodedTxInputs[2], inputs2: inputs[2] }, null, 2));
//   if (decodedTxInputs[2] !== inputs[2]) {
//     throw new Error(`Ipfs hash mismatch: ${decodedTxInputs[2]} !== ${inputs[2]}`);
//   }

//   console.long(JSON.stringify({ decodedTxInputs3: decodedTxInputs[3], inputs3: inputs[3] }, null, 2));
//   if (decodedTxInputs[3] !== inputs[3]) {
//     throw new Error(`Category mismatch: ${decodedTxInputs[3]} !== ${inputs[3]}`);
//   }
// };

// /**
//  *
//  * Generate the tx data for the Governance.createProposal transaction using the provided proposal data
//  *
//  * @param proposalFilePath path for file of proposal data containing title, shortDescription, and description
//  * @param categoryId category id for the proposal
//  * @returns {Promise<{createProposal: *}>}
//  */
// const main = async (proposalFilePath, categoryId) => {
//   const governance = await ethers.getContractAt('Governance', GOVERNANCE_ADDRESS);
//   const [proposal] = require(path.resolve(proposalFilePath));

//   // check for any missing required data before processing and uploading files to IPFS
//   if (Object.keys(proposal).length > 3) {
//     throw new Error('Proposal data should only contain title, shortDescription, and description');
//   }

//   if (!proposal.title) {
//     throw new Error('Proposal title is required');
//   }

//   if (!proposal.shortDescription) {
//     throw new Error('Proposal short description is required');
//   }

//   if (!proposal.description) {
//     throw new Error('Proposal description is required');
//   }

//   if (!categoryId) {
//     throw new Error('Category ID is required');
//   }

//   // upload proposal file to IPFS
//   const file = await ipfs.add(fs.readFileSync(proposalFilePath));
//   await ipfs.pin.add(file.path);

//   // group the inputs for the createProposal transaction
//   const inputs = [proposal.title, proposal.shortDescription, file.path, categoryId];

//   // create the transaction data for createProposal
//   const createProposalTransaction = await governance.populateTransaction.createProposal(...inputs);
//   console.log(`Tx data:\n${createProposalTransaction.data}`);

//   // simulate the transaction
//   const decodedTxInputs = await simulateTransaction(createProposalTransaction.data);

//   // verify the decoded inputs match the inputs
//   verifyDecodedTxInputs(inputs, decodedTxInputs);

//   return createProposalTransaction;
// };

// if (require.main === module) {
//   main(process.argv[2], process.argv[3]).catch(e => {
//     console.log('Unhandled error encountered: ', e.stack);
//     process.exit(1);
//   });
// }

// module.exports = main;
