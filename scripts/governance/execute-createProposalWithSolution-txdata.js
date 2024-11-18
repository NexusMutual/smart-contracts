require('dotenv').config();
const { ethers, network } = require('hardhat');
const { sendTransaction, prepareProposalTransaction } = require('./helpers');

/**
 * Generate and execute the tx data for the Governance.createProposalWithSolution transaction
 * @param proposalFilePath path for file of proposal data containing title, shortDescription, and description
 * @param categoryId category id for the proposal
 * @param actionParamsRaw action params for the proposal as stringified JSON
 * @param solutionHash hash of the solution for the proposal
 * @returns {Promise<{createProposalWithSolution: *}>}
 */
const main = async (proposalFilePath, categoryId, actionParamsRaw, solutionHash = '') => {
  if (network.name === 'tenderly') {
    const { TENDERLY_SNAPSHOT_ID } = process.env;
    if (TENDERLY_SNAPSHOT_ID) {
      await ethers.provider.send('evm_revert', [TENDERLY_SNAPSHOT_ID]);
      console.info(`Reverted to snapshot ${TENDERLY_SNAPSHOT_ID}`);
    } else {
      console.info('Snapshot ID: ', await ethers.provider.send('evm_snapshot', []));
    }
  }

  const { transaction } = await prepareProposalTransaction(proposalFilePath, categoryId, actionParamsRaw, solutionHash);

  console.log(`Tx data:\n${transaction.data}`);

  // Execute the transaction
  const receipt = await sendTransaction(transaction.data);
  console.log('Transaction receipt:', receipt);

  return transaction;
};

if (require.main === module) {
  main(process.argv[2], process.argv[3], process.argv[4], process.argv[5])
    .then(() => process.exit(0))
    .catch(e => {
      console.log('Unhandled error encountered: ', e.stack);
      process.exit(1);
    });
}

module.exports = main;
