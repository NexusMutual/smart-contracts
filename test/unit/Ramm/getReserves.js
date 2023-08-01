const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

describe('getReserves', function () {
  it('should return current state in the pools', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;

    const timestamp = await ramm.lastSwapTimestamp();
    await setNextBlockTime(timestamp.add(6 * 60 * 60).toNumber());
    await mineNextBlock();
    const { currentLiquidity, nxmA, nxmB, currentBudget } = await ramm.getReserves();

    expect(currentLiquidity).to.be.equal('2050000000000000000000'); // extracted from the prototype simulation
    expect(nxmA).to.be.equal('68826162646107933349888'); // extracted from the prototype simulation
    expect(nxmB).to.be.equal('200688905003625815808560'); // extracted from the prototype simulation
    expect(currentBudget).to.be.equal('200000000000000000000'); // extracted from the prototype simulation
  });
});
