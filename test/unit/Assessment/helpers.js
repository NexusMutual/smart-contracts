const evm = require('../../utils/evm');

/**
 * Sets the blockchain time to a specific timestamp
 * @param {number | bigint} timestamp - The timestamp to set
 */
async function setTime(timestamp) {
  await evm.setNextBlockTime(Number(timestamp));
  await evm.mineNextBlock();
}

module.exports = {
  setTime,
};
