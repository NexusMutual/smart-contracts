const evm = require('../../utils/evm');

const daysToSeconds = days => days * 24 * 60 * 60;

/**
 * Sets the blockchain time to a specific timestamp
 * @param {number | bigint} timestamp - The timestamp to set
 */
async function setTime(timestamp) {
  await evm.setNextBlockTime(Number(timestamp));
  await evm.mineNextBlock();
}

module.exports = {
  daysToSeconds,
  setTime,
};
