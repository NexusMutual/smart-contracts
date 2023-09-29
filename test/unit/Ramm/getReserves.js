const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { getReserves } = require('../../utils/getReserves');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

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
    const nextBlockTime = timestamp + timeElapsed;
    await setNextBlockTime(nextBlockTime);
    await mineNextBlock();

    const { _ethReserve, nxmA, nxmB, _budget } = await ramm.getReserves();
    const expectedReserves = await getReserves(fixture.state, pool, tokenController, nextBlockTime);

    expect(_ethReserve).to.be.equal(expectedReserves.eth);
    expect(nxmA).to.be.equal(expectedReserves.nxmA);
    expect(nxmB).to.be.equal(expectedReserves.nxmB);
    expect(_budget).to.be.equal(expectedReserves.budget);
  });
});
