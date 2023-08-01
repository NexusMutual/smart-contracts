const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

describe('getSpotPrices', function () {
  it('should return spot current prices', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const timestamp = await ramm.lastSwapTimestamp();
    await setNextBlockTime(timestamp.add(6 * 60 * 60).toNumber());
    await mineNextBlock();
    const { spotPriceA, spotPriceB } = await ramm.getSpotPrices();
    expect(spotPriceA).to.be.equal('29785185185185185'); // extracted from the prototype simulation
    expect(spotPriceB).to.be.equal('10214814814814814'); // extracted from the prototype simulation
  });
});
