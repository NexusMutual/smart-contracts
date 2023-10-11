const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

describe('storeState', function () {
  it('should store state correctly', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minTokensOut = parseEther('28');
    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;

    const initialState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const before = await ramm._getReserves(initialState, capital, supply, nextBlockTimestamp);

    // buy NXM
    await setNextBlockTime(nextBlockTimestamp);
    const tx = await ramm.connect(member).swap(0, minTokensOut, { value: ethIn });
    await tx.wait();
    const after = await ramm.loadState();

    const k = before.eth.mul(before.nxmA);
    const newEth = before.eth.add(ethIn);

    // check storeState correctly stored new values
    expect(after.nxmA).to.be.equal(k.div(newEth));
    expect(after.nxmB).to.be.equal(before.nxmB.mul(newEth).div(before.eth));
    expect(after.eth).to.be.equal(newEth);
    expect(after.timestamp).to.be.equal(nextBlockTimestamp);
  });
});
