const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { expect } = require('chai');

const { setup } = require('./setup');

describe('loadState', function () {
  it('should correctly return the current state', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const state = await ramm.loadState();

    // Expected state
    const { nxmReserveA, nxmReserveB } = await ramm.slot0();
    const { ethReserve, budget, updatedAt } = await ramm.slot1();
    const ratchetSpeedB = await ramm.ratchetSpeedB();

    expect(state.nxmA).to.be.equal(nxmReserveA);
    expect(state.nxmB).to.be.equal(nxmReserveB);
    expect(state.eth).to.equal(ethReserve);
    expect(state.budget).to.equal(budget);
    expect(state.ratchetSpeedB).to.equal(ratchetSpeedB);
    expect(state.timestamp).to.equal(updatedAt);
  });
});
