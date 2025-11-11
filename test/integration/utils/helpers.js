const { getFundedSigner } = require('../../utils/signer');
const { executeGovernorProposal } = require('../../utils/governor');

/**
 * Parse events from transaction receipt using ethers v6 native functionality
 * @param {Object} txReceipt - Transaction receipt from tx.wait()
 * @param {Object} filterContract - Contract instance to parse logs with
 * @param {string|null} filterName - Optional event name filter
 * @param {Object|null} filterArgs - Optional event arguments filter
 * @returns {Array} Parsed events matching the filters
 */
const getEventsFromTxReceipt = (txReceipt, filterContract, filterName = null, filterArgs = null) => {
  let events = txReceipt.logs
    .filter(log => log.address === filterContract.target)
    .map(log => {
      try {
        return filterContract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .filter(event => event !== null);

  if (filterName) {
    events = events.filter(event => event.name === filterName);
  }

  if (filterArgs) {
    events = events.filter(event => Object.entries(filterArgs).every(([key, value]) => event.args[key] === value));
  }

  return events;
};

/**
 * Converts the given number of days to seconds
 * @param {*} days
 * @returns
 */
const daysToSeconds = days => days * 24 * 3600;

/**
 * Helper function to mint NXM tokens to an address by impersonating TokenController
 * @param {string} address - The address to mint tokens to
 * @param {BigInt} amount - The amount of tokens to mint
 * @param {Object} tokenController - TokenController contract instance
 * @param {Object} token - NXMToken contract instance
 */
async function mintNxmTo(address, amount, tokenController, token) {
  const tokenControllerSigner = await getFundedSigner(tokenController.target);
  await token.connect(tokenControllerSigner).mint(address, amount);
}

module.exports = {
  getEventsFromTxReceipt,
  daysToSeconds,
  mintNxmTo,
  executeGovernorProposal,
};
