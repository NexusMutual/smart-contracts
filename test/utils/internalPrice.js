const { calculateInternalPrice } = require('../unit/Ramm/helpers');

async function getInternalPrice(ramm, pool, tokenController, mcr, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await mcr.getMCR();
  const GRANULARITY = await ramm.GRANULARITY();
  const PERIOD_SIZE = await ramm.PERIOD_SIZE();

  const previousState = await ramm.loadState();
  const previousObservations = [];

  for (let i = 0; i < 3; i++) {
    previousObservations[i] = await ramm.observations(i);
  }

  const currentState = await ramm._getReserves(previousState, capital, supply, mcrValue, timestamp);

  const observations = await ramm._updateTwap(
    previousState,
    previousObservations,
    timestamp,
    capital,
    supply,
    mcrValue,
  );

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

module.exports = {
  getInternalPrice,
};
