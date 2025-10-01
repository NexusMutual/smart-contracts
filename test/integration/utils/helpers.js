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

const daysToSeconds = days => days * 24 * 3600;

module.exports = {
  getEventsFromTxReceipt,
  daysToSeconds,
};
