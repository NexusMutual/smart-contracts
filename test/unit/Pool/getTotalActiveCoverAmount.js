const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = require('ethers');

describe('getTotalActiveCoverAmount', function () {
  it('return total active cover from cover contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, cover } = fixture;

    const activeCover = parseEther('1');
    await cover.setTotalActiveCoverInAsset(0, activeCover);

    const totalActiveCover = await pool.getTotalActiveCoverAmount();
    expect(totalActiveCover).to.equal(activeCover);
  });
});
