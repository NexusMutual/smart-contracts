/**
 * Calculates the internal NXM token price in ETH
 */
async function getInternalPrice(ramm, pool, tokenController, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await pool.getMCR();
  const context = {
    capital,
    supply,
    mcr: mcrValue,
  };

  const GRANULARITY = await ramm.GRANULARITY();
  const PERIOD_SIZE = await ramm.PERIOD_SIZE();

  const previousState = await ramm.loadState();
  const previousObservations = [];

  for (let i = 0; i < 3; i++) {
    const observation = await ramm.observations(i);
    previousObservations[i] = observation.toObject();
  }

  const [currentState] = await ramm._getReserves(previousState.toObject(), context, timestamp);

  const observations = await ramm._updateTwap(previousState.toObject(), previousObservations, context, timestamp);

  // Import calculateInternalPrice from rammCalculations
  const { calculateInternalPrice } = require('../unit/Ramm/rammCalculations');

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

module.exports = {
  getInternalPrice,
};
