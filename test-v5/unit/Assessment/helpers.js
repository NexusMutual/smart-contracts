const { evm } = require('../../utils');

const daysToSeconds = days => days * 24 * 60 * 60;

/**
 * Sets the blockchain time to a specific timestamp
 * @param {number} timestamp - The timestamp to set
 */
async function setTime(timestamp) {
  await evm.setNextBlockTime(timestamp);
  await evm.mineNextBlock();
}

module.exports = {
  daysToSeconds,
  setTime,
};
