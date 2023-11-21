const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

describe('storeState', function () {
  it('should store state correctly', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28');
    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;
    const deadline = timestamp + 7 * 60 * 60;

    const initialState = await ramm.loadState();
    const context = {
      capital: await pool.getPoolValueInEth(),
      supply: await tokenController.totalSupply(),
      mcr: await mcr.getMCR(),
    };

    const [before] = await ramm._getReserves(initialState, context, nextBlockTimestamp);

    // buy NXM
    await setNextBlockTime(nextBlockTimestamp);
    const tx = await ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });
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

  it('should update ratchetSpeed to NORMAL_RATCHET_SPEED if budget is 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [governance] = fixture.accounts.governanceContracts;

    const before = await ramm.loadState();

    // set budget to 0
    const governanceSigner = await ethers.provider.getSigner(governance.address);
    await ramm.connect(governanceSigner).removeBudget();

    const EXPECTED_NORMAL_RATCHET_SPEED = 400;
    const after = await ramm.loadState();

    // check storeState correctly updated ratchetSpeedB
    expect(before.ratchetSpeedB).to.be.not.equal(EXPECTED_NORMAL_RATCHET_SPEED);
    expect(after.ratchetSpeedB).to.be.equal(EXPECTED_NORMAL_RATCHET_SPEED);
  });
});
