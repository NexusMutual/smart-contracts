const fs = require('node:fs');
const path = require('node:path');

const { ethers, network } = require('hardhat');
const ipfsClient = require('ipfs-http-client');

const { constants } = require('./helpers');

const { AbiCoder, JsonRpcSigner, JsonRpcProvider } = ethers;
const { AB_MEMBER, GOVERNANCE_ADDRESS, IPFS_API_URL, CATEGORY_PARAM_TYPES } = constants;

const ipfs = ipfsClient({ url: IPFS_API_URL });

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

  const abiCoder = new AbiCoder();
  const encodedActionParams = abiCoder.encode(CATEGORY_PARAM_TYPES[categoryId], actionParams);

  // upload proposal file to IPFS
  const file = await ipfs.add(fs.readFileSync(proposalFilePath));
  await ipfs.pin.add(file.path);

  // group the inputs for the createProposalWithSolution transaction
  const inputs = [proposal.title, proposal.shortDescription, file.path, categoryId, solutionHash, encodedActionParams];

  const signer = new JsonRpcSigner(new JsonRpcProvider(network.config.url), AB_MEMBER);
  const tx = await governance.connect(signer).createProposalwithSolution(...inputs);
  console.log(`Tx hash: ${tx.hash}`);
  console.log(`Tx data: ${tx.data}`);
};

if (require.main === module) {
  main(process.argv[2], process.argv[3], process.argv[4], process.argv[5]).catch(e => {
    console.log('Unhandled error encountered: ', e.stack);
    process.exit(1);
  });
}

module.exports = main;
