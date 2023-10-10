const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

const { BigNumber } = ethers;
const { parseEther } = ethers.utils;

/* ========== ramm.getReserves JS implementation ========== */
/* The logic and constants used in this file was copied from Ramm.sol */

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

const getReserves = async (state, pool, tokenController, currentTimestamp) => {
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  return _getReserves(state, capital, supply, BigNumber.from(currentTimestamp));
};

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

/* ========== Set Slo1.ethReserve helper functions ========== */

/**
 * Sets the value of the Ether reserve in the RAMM contract.
 *
 * @async
 * @param {string} rammAddress - The address of the RAMM contract
 * @param {number} valueInEther - The value of the Ether reserve in Ether
 * @return {Promise<void>}
 */
const setEthReserveValue = async (rammAddress, valueInEther) => {
  const SLOT_1_POSITION = '0x3';
  // Convert valueInEther to 128 bits wei hex value
  const hexValueInWei = parseEther(valueInEther.toString()).toHexString();
  const newEtherReserve = '0x' + removeHexPrefix(hexValueInWei).padStart(32, '0'); // 32 hex chars in 128 bits
  // Get current Slot1 value
  const slot1Value = await ethers.provider.send('eth_getStorageAt', [rammAddress, SLOT_1_POSITION]);
  // Update Slot1 to have new ethReserve value
  const newSlot1Value = await replaceHexValueInBitPos(slot1Value, newEtherReserve, 128);
  return ethers.provider.send('hardhat_setStorageAt', [rammAddress, SLOT_1_POSITION, newSlot1Value]);
};

/**
 * Replaces a bit value in a hexadecimal string with a new value at a specific bit position.
 *
 * @param {string} origHex - The original hexadecimal string (must be 256 bits / 64 hex characters)
 * @param {string} newHexValue - The new hexadecimal value to replace with
 * @param {number} bitPosition - The position of the bit in the original string to replace
 * @return {string} The modified hexadecimal string
 */
const replaceHexValueInBitPos = (origHex, newHexValue, bitPosition) => {
  // Convert hex to buffers
  const bufferOrig = Buffer.from(removeHexPrefix(origHex), 'hex');
  const bufferNewVal = Buffer.from(removeHexPrefix(newHexValue), 'hex');

  // Calculate the correct byte start position and copy the new value into the original buffer
  const byteStart = origHex.length / 2 - bitPosition / 8;
  bufferNewVal.copy(bufferOrig, byteStart);

  return '0x' + bufferOrig.toString('hex');
};

/**
 * Removes the '0x' prefix from a hexadecimal string if it exists.
 *
 * @param {string} hex - The hexadecimal string from which the prefix needs to be removed
 * @returns {string} - The modified hexadecimal string without the '0x' prefix
 */
const removeHexPrefix = hex => (hex.startsWith('0x') ? hex.slice(2) : hex);

describe('getReserves', function () {
  it('should return current state in the pools - ratchet value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 1 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const currentState = await getState(ramm);
    const expectedReserves = await getReserves(currentState, pool, tokenController, nextBlockTimestamp);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
  it('should return current state in the pools - book value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    // set next block time far enough to reach book value (e.g. 5 days)
    const { timestamp } = await ethers.provider.getBlock('latest');
    const timeElapsed = 5 * 24 * 60 * 60;
    const nextBlockTimestamp = timestamp + timeElapsed;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const currentState = await getState(ramm);
    const expectedReserves = await getReserves(currentState, pool, tokenController, nextBlockTimestamp);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
  it('should return current state in the pools - extract ETH flow where eth > TARGET_LIQUIDITY', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    // Set ethReserve to 5100 (i.e. > than 5000 TARGET_LIQUIDITY) to force extract ETH flow
    await setEthReserveValue(ramm.address, 5100);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 1 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const rammState = await getState(ramm);
    const expectedReserves = await getReserves(rammState, pool, tokenController, nextBlockTimestamp);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
  it('should return current state in the pools - inject ETH flow where elapsed <= timeLeftOnBudget', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    // Set ethReserve to 4900 (i.e. < than 5000 TARGET_LIQUIDITY) to force inject ETH flow
    await setEthReserveValue(ramm.address, 4900);

    const { timestamp } = await ethers.provider.getBlock('latest');
    // Set next block time to 1 hr (i.e. 1 hr elapsed < 701.36 hrs timeLeftOnBudget)
    const nextBlockTimestamp = timestamp + 1 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const rammState = await getState(ramm);
    const expectedReserves = await getReserves(rammState, pool, tokenController, nextBlockTimestamp);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
  it('should return current state in the pools - inject ETH flow elapsed > timeLeftOnBudget', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    // Set ethReserve to 4900 (i.e. < than 5000 TARGET_LIQUIDITY) to force inject ETH flow
    await setEthReserveValue(ramm.address, 4900);

    const { timestamp } = await ethers.provider.getBlock('latest');
    // Set next block time to + 702 hrs (i.e. 702 elapsed > 701.36 hrs timeLeftOnBudget)
    const nextBlockTimestamp = timestamp + 702 * 24 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const rammState = await getState(ramm);
    const expectedReserves = await getReserves(rammState, pool, tokenController, nextBlockTimestamp);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
});
