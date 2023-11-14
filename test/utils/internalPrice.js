const { calculateInternalPrice } = require('../unit/Ramm/helpers');

async function getInternalPrice(ramm, pool, tokenController, mcr, timestamp) {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await mcr.getMCR();
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
    previousObservations[i] = await ramm.observations(i);
  }

  const [currentState] = await ramm._getReserves(previousState, context, timestamp);

  const observations = await ramm._updateTwap(previousState, previousObservations, context, timestamp);

  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

module.exports = {
  getInternalPrice,
};
