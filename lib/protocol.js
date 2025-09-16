const { ethers } = require('ethers');
const { parseEther, ZeroAddress } = ethers;

const COVER_PRICE_DENOMINATOR = 10000n;

function getObservationIndex(timestamp, { PERIOD_SIZE, GRANULARITY }) {
  if (timestamp % PERIOD_SIZE > 1) {
    return (timestamp / PERIOD_SIZE + 1n) % GRANULARITY;
  }
  return (timestamp / PERIOD_SIZE) % GRANULARITY;
}

// ======================== RAMM ==============================================

// TODO: eject from lib - we'll clearly not use it outside of tests
/**
 * Calculates the internal NXM token price in ETH for given states
 */
function calculateInternalPrice(currentState, observations, capital, supply, currentTimestamp, constants) {
  const { GRANULARITY } = constants;
  const currentIdx = getObservationIndex(BigInt(currentTimestamp), constants);
  const previousIdx = (currentIdx + 1n) % GRANULARITY;

  const firstObservation = observations[Number(previousIdx)];
  const currentObservation = observations[Number(currentIdx)];

  const elapsed = BigInt(currentTimestamp) - firstObservation.timestamp;

  const spotPriceA = (parseEther('1') * currentState.eth) / currentState.nxmA;
  const spotPriceB = (parseEther('1') * currentState.eth) / currentState.nxmB;

  const averagePriceA = (currentObservation.priceCumulativeAbove - firstObservation.priceCumulativeAbove) / elapsed;

  const averagePriceB = (currentObservation.priceCumulativeBelow - firstObservation.priceCumulativeBelow) / elapsed;

  const priceA = averagePriceA > spotPriceA ? spotPriceA : averagePriceA;
  const priceB = averagePriceB > spotPriceB ? averagePriceB : spotPriceB;

  const internalPrice = ((priceA + priceB - parseEther('1')) * capital) / supply;
  const maxPrice = (parseEther('1') * 3n * capital) / supply; // 300% BV
  const minPrice = (parseEther('1') * 35n * capital) / (supply * 100n); // 35% BV

  const maxInternalPrice = internalPrice > maxPrice ? internalPrice : maxPrice;
  return maxInternalPrice > minPrice ? minPrice : maxInternalPrice;
}

// TODO: eject from lib - we'll clearly not use it outside of tests
/**
 * Calculates the expected internal NXM price in ETH
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
    previousObservations[i] = {
      priceCumulativeAbove: observation.priceCumulativeAbove,
      priceCumulativeBelow: observation.priceCumulativeBelow,
      timestamp: observation.timestamp,
    };
  }
  const state = {
    nxmA: previousState.nxmA,
    nxmB: previousState.nxmB,
    eth: previousState.eth,
    budget: previousState.budget,
    ratchetSpeedB: previousState.ratchetSpeedB,
    timestamp: previousState.timestamp,
  };

  const [currentState] = await ramm._getReserves(state, context, timestamp);

  const observations = await ramm._updateTwap(state, previousObservations, context, timestamp);
  return calculateInternalPrice(currentState, observations, capital, supply, timestamp, { GRANULARITY, PERIOD_SIZE });
}

// ======================= COVER ==============================================

function calculatePremium(amount, rate, period, price, allocationUnit) {
  const nxmAmount = (amount * parseEther('1')) / rate;

  const coverNXMAmount =
    nxmAmount % allocationUnit === 0n ? nxmAmount : (nxmAmount / allocationUnit + 1n) * allocationUnit;

  const premiumInNxm = (((coverNXMAmount * price) / COVER_PRICE_DENOMINATOR) * period) / (365n * 24n * 60n * 60n);

  const premiumInAsset = (premiumInNxm * rate) / parseEther('1');

  return { premiumInNxm, premiumInAsset, coverNXMAmount };
}

// ====================== STAKING =============================================

function calculateFirstTrancheId(lastBlock, period, gracePeriod) {
  return Math.floor((lastBlock.timestamp + Number(period) + Number(gracePeriod)) / (91 * 24 * 3600));
}

// TODO: eject from lib
async function stakeOnly({ stakingPool, staker, period, gracePeriod, trancheIdOffset }) {
  // Staking inputs
  const stakingAmount = parseEther('100');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId + trancheIdOffset,
    0, // new position
    ZeroAddress, // destination
  );
}

// TODO: eject from lib
async function stake({ contracts, stakingPool, staker, productId, period, gracePeriod, amount = 0 }) {
  const { stakingProducts } = contracts;

  // Staking inputs
  const stakingAmount = amount !== 0n ? amount : parseEther('10000');
  const lastBlock = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(lastBlock, period, gracePeriod);

  // Stake to open up capacity
  await stakingPool.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    0, // new position
    ZeroAddress, // destination
  );

  const stakingProductParams = {
    productId,
    recalculateEffectiveWeight: true,
    setTargetWeight: true,
    targetWeight: 100, // 1
    setTargetPrice: true,
    targetPrice: 100, // 1%
  };

  // Set staked products
  const managerSigner = await ethers.getSigner(await stakingPool.manager());
  const poolId = await stakingPool.getPoolId();
  await stakingProducts.connect(managerSigner).setProducts(poolId, [stakingProductParams]);
}

module.exports = {
  calculateInternalPrice,
  getInternalPrice,
  calculatePremium,
  calculateFirstTrancheId,
  stakeOnly,
  stake,
};
