const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const { parseEther } = ethers;

describe('storeState', function () {
  it('should store state correctly', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28');
    const currentTimestamp = await time.latest();
    const nextBlockTimestamp = currentTimestamp + 6 * 60 * 60;
    const deadline = currentTimestamp + 7 * 60 * 60;

    const initialState = await ramm.loadState();
    const context = {
      capital: await pool.getPoolValueInEth(),
      supply: await tokenController.totalSupply(),
      mcr: await pool.getMCR(),
    };

    const [before] = await ramm._getReserves(initialState.toObject(), context, BigInt(nextBlockTimestamp));

    // buy NXM
    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });
    const after = await ramm.loadState();

    const k = before.eth * before.nxmA;
    const newEth = before.eth + ethIn;

    // check storeState correctly stored new values
    expect(after.nxmA).to.be.equal(k / newEth);
    expect(after.nxmB).to.be.equal((before.nxmB * newEth) / before.eth);
    expect(after.eth).to.be.equal(newEth);
    expect(after.timestamp).to.be.equal(BigInt(nextBlockTimestamp));
  });

  it('should update ratchetSpeed to NORMAL_RATCHET_SPEED if budget is 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governor] = fixture.accounts.governanceContracts;

    await ramm.connect(governor).removeBudget();
    const state = await ramm.loadState();

    expect(state.ratchetSpeedB).to.be.equal(await ramm.NORMAL_RATCHET_SPEED());
  });
});
