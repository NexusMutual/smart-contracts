const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');
const { calculateCurrentMCR } = require('../utils');
const { parseEther } = ethers;

const stored = 12348870328212262601890n;
const desired = 10922706197119349905840n;
const updatedAt = 1751371403n;

describe('getMCRRatio', function () {
  it('should return right MCR ratio', async function () {
    const fixture = await loadFixture(setup);
    const { pool, constants } = fixture;

    const totalAssetValue = parseEther('10000');
    await setBalance(await pool.target, totalAssetValue);
    const { timestamp } = await ethers.provider.getBlock('latest');

    const nextBlockTimestamp = BigInt(timestamp) + 86400n;

    const mcr = calculateCurrentMCR({ stored, desired, now: nextBlockTimestamp, updatedAt }, constants);
    const expectedValue = (totalAssetValue * 10n ** constants.MCR_RATIO_DECIMALS) / mcr;

    await setNextBlockTime(Number(nextBlockTimestamp));
    const mcrRatio = await pool.getMCRRatio();

    expect(mcrRatio).to.be.equal(expectedValue);
  });
});
