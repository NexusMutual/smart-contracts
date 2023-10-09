const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { getReserves } = require('../../utils/getReserves');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');
const { parseEther } = require('ethers/lib/utils');

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
  // Convert valueInEther to 128 bits hex value
  const hexNoPrefix = parseEther(valueInEther.toString()).toHexString().slice(2);
  const newEtherReserve = '0x' + hexNoPrefix.padStart(32, '0'); // 32 hex chars in 128 bits
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

const removeHexPrefix = hex => (hex.startsWith('0x') ? hex.substring(2) : hex);

describe('getReserves', function () {
  it('should return current state in the pools - ratchet value', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 1 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const expectedReserves = await getReserves(fixture.state, pool, tokenController, nextBlockTimestamp);

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
    const expectedReserves = await getReserves(fixture.state, pool, tokenController, nextBlockTimestamp);

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

    console.log(_ethReserve, nxmA, nxmB, _budget);
    console.log(expectedReserves);
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

    console.log(_ethReserve, nxmA, nxmB, _budget);
    console.log(expectedReserves);
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

    console.log(_ethReserve, nxmA, nxmB, _budget);
    console.log(expectedReserves);
    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
});
