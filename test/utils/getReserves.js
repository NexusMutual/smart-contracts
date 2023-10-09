const { ethers } = require('hardhat');

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

/**
 * The constants as well as the logic used in this file was copied from Ramm.sol
 */

/* ========== FUNCTIONS ========== */

const LIQ_SPEED_PERIOD = 1 * 24 * 60 * 60;
const RATCHET_PERIOD = 1 * 24 * 60 * 60;
const RATCHET_DENOMINATOR = BigNumber.from(10000);
const PRICE_BUFFER = BigNumber.from(100);
const PRICE_BUFFER_DENOMINATOR = BigNumber.from(10000);
// const GRANULARITY = 2;
// const PERIOD_SIZE = 1 * 24 * 60 * 60;

/* =========== IMMUTABLES ========== */

const FAST_LIQUIDITY_SPEED = parseEther('1500');
const TARGET_LIQUIDITY = parseEther('5000');
const LIQ_SPEED_A = parseEther('100');
const LIQ_SPEED_B = parseEther('100');
// const FAST_RATCHET_SPEED = BigNumber.from(5000);
// const NORMAL_RATCHET_SPEED = 400;

const _getReserves = (state, capital, supply, currentTimestamp) => {
  let eth = state.eth;
  let budget = state.budget;

  const elapsed = currentTimestamp.sub(state.timestamp);

  if (eth.lt(TARGET_LIQUIDITY)) {
    // inject eth
    const timeLeftOnBudget = budget.mul(LIQ_SPEED_PERIOD).div(FAST_LIQUIDITY_SPEED);
    const maxToInject = TARGET_LIQUIDITY.sub(eth);
    let injected;

    if (elapsed.lte(timeLeftOnBudget)) {
      const injectedFast = elapsed.mul(FAST_LIQUIDITY_SPEED).div(LIQ_SPEED_PERIOD);
      injected = injectedFast.lt(maxToInject) ? injectedFast : maxToInject;
    } else {
      const injectedFast = timeLeftOnBudget.mul(FAST_LIQUIDITY_SPEED).div(LIQ_SPEED_PERIOD);
      const elapsedTimeLeft = elapsed.sub(timeLeftOnBudget);
      const injectedSlow = elapsedTimeLeft.mul(LIQ_SPEED_B).mul(parseEther('1')).div(LIQ_SPEED_PERIOD);
      const injectedFastPlusSlow = injectedFast.add(injectedSlow);
      injected = maxToInject.lt(injectedFastPlusSlow) ? maxToInject : injectedFastPlusSlow;
    }

    eth = eth.add(injected);
    budget = budget.gt(injected) ? budget.sub(injected) : 0;
  } else {
    // extract eth
    const elapsedLiquidity = elapsed.mul(LIQ_SPEED_A).mul(parseEther('1')).div(LIQ_SPEED_PERIOD);
    const ethToTargetLiquidity = eth.sub(TARGET_LIQUIDITY);
    const ethToExtract = elapsedLiquidity.lt(ethToTargetLiquidity) ? elapsedLiquidity : ethToTargetLiquidity;
    eth = eth.sub(ethToExtract);
  }

  let nxmA = state.nxmA.mul(eth).div(state.eth);
  let nxmB = state.nxmB.mul(eth).div(state.eth);

  // apply ratchet below
  // if cap*n*(1+r) > e*sup
  // if cap*n.add(cap*n*r > e*sup
  //   set n(new) = n(BV)
  // else
  //   set n(new) = n(R)
  const r = elapsed.mul(state.ratchetSpeed);
  const priceBufferA = PRICE_BUFFER_DENOMINATOR.add(PRICE_BUFFER);
  const bufferedCapitalA = capital.mul(priceBufferA).div(PRICE_BUFFER_DENOMINATOR);

  const kA = bufferedCapitalA.mul(nxmA);
  const kARatchetValue = bufferedCapitalA.mul(nxmA).mul(r).div(RATCHET_PERIOD).div(RATCHET_DENOMINATOR);
  const kARatcheted = kA.add(kARatchetValue);

  if (kARatcheted.gt(eth.mul(supply))) {
    // use bv
    nxmA = eth.mul(supply).div(bufferedCapitalA);
  } else {
    // use ratchet
    const nrDenomAddend = r.mul(capital).mul(nxmA).div(supply).div(RATCHET_PERIOD).div(RATCHET_DENOMINATOR);
    nxmA = eth.mul(nxmA).div(eth.sub(nrDenomAddend));
  }

  // apply ratchet below
  // check if we should be using the ratchet or the book value price using:
  // Nbv > Nr <=>
  // ... <=>
  // cap * n < e * sup + r * cap * n
  const priceBufferB = PRICE_BUFFER_DENOMINATOR - PRICE_BUFFER;
  const bufferedCapitalB = capital.mul(priceBufferB).div(PRICE_BUFFER_DENOMINATOR);

  const kB = bufferedCapitalB.mul(nxmB);
  const kBRatchetValue = nxmB
    .mul(capital)
    .mul(elapsed)
    .mul(state.ratchetSpeed)
    .div(RATCHET_PERIOD)
    .div(RATCHET_DENOMINATOR);
  const kBRatcheted = eth.mul(supply).add(kBRatchetValue);
  if (kB.lt(kBRatcheted)) {
    // use bv
    nxmB = eth.mul(supply).div(bufferedCapitalB);
  } else {
    // use ratchet
    const nrDenomAddend = nxmB
      .mul(elapsed)
      .mul(state.ratchetSpeed)
      .mul(capital)
      .div(supply)
      .div(RATCHET_PERIOD)
      .div(RATCHET_DENOMINATOR);
    nxmB = eth.mul(nxmB).div(eth.add(nrDenomAddend));
  }

  return {
    nxmA,
    nxmB,
    eth,
    budget,
    ratchetSpeed: state.ratchetSpeed,
    timestamp: currentTimestamp,
  };
};

const getReserves = async (state, pool, tokenController, currentTimestamp) => {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  return _getReserves(state, capital, supply, BigNumber.from(currentTimestamp));
};

module.exports = {
  getReserves,
};
