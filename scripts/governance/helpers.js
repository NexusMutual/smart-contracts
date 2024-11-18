require('dotenv').config();

const path = require('node:path');

const axios = require('axios');
const fs = require('fs');
const { ethers } = require('hardhat');
const ipfsClient = require('ipfs-http-client');
const { inspect } = require('util');

const { AB_MEMBER, GOVERNANCE_ADDRESS, IPFS_API_URL } = require('./constants');
const { getEncodedAction } = require('./get-encoded-action-data');

const ipfs = ipfsClient({ url: IPFS_API_URL });

/**
 * NOTE: requires TENDERLY_ACCESS_KEY env
 * @param {HexString} input - the tx.data
 */
const simulateTransaction = async input => {
  const payload = {
    save: true, // save result to dashboard
    save_if_fails: true, // show reverted txs in dashboard
    simulation_type: 'full',
    network_id: '1',
    from: AB_MEMBER,
    to: GOVERNANCE_ADDRESS,
    gas: 8000000,
    gas_price: 0,
    value: 0,
    input,
  };

  const response = await axios.post(
    `https://api.tenderly.co/api/v1/account/NexusMutual/project/nexusmutual/simulate`,
    payload,
    { headers: { 'X-Access-Key': process.env.TENDERLY_ACCESS_KEY } },
  );

  const { transaction, simulation } = response.data;
  console.info(
    '\nTenderly Simulated transaction:\n',
    `https://dashboard.tenderly.co/NexusMutual/nexusmutual/simulator/${simulation.id}`,
  );
  const decodedTxInputs = transaction.transaction_info.call_trace.decoded_input.map(input => input.value);
  console.info('governance.createProposal input:\n', inspect(decodedTxInputs, { depth: null }));

  return decodedTxInputs;
};

/**
 * Sends a transaction to the blockchain
 * @param {string} txData - The encoded transaction data
 * @returns {Promise<TransactionReceipt>} The transaction receipt
 */
const sendTransaction = async input => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.TENDERLY_PROVIDER_URL);

  const tx = {
    to: GOVERNANCE_ADDRESS,
    data: input,
    gasLimit: 8000000,
    from: AB_MEMBER,
  };

  const txHash = await provider.send('eth_sendTransaction', [tx]);
  console.info('\nTransaction sent:\n', txHash);

  const receipt = await provider.waitForTransaction(txHash);
  console.info('Transaction mined');

  return receipt;
};

const verifyDecodedCreateProposalTxInputs = (inputs, decodedTxInputs) => {
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

const prepareProposalTransaction = async (proposalFilePath, categoryId, actionParamsRaw, solutionHash = '') => {
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

  // Get encoded action parameters
  const encodedActionParams = getEncodedAction(categoryId, actionParams);

  // upload proposal file to IPFS
  const file = await ipfs.add(fs.readFileSync(proposalFilePath));
  await ipfs.pin.add(file.path);
  console.log(`IPFS file path ${file.path}`);

  // Prepare inputs
  const inputs = [proposal.title, proposal.shortDescription, file.path, categoryId, solutionHash, encodedActionParams];

  // Create transaction data
  const createProposalTransaction = await governance.populateTransaction.createProposalwithSolution(...inputs);

  return {
    transaction: createProposalTransaction,
    inputs,
  };
};

module.exports = {
  simulateTransaction,
  sendTransaction,
  verifyDecodedCreateProposalTxInputs,
  prepareProposalTransaction,
};
