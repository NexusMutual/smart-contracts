const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getState, setup } = require('./setup');
const { setNextBlockBaseFee, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

const getSupplyAndBalances = async (tokenController, nxm, memberAddress) => {
  return {
    totalSupply: await tokenController.totalSupply(),
    nxmBalance: await nxm.balanceOf(memberAddress),
    ethBalance: await ethers.provider.getBalance(memberAddress),
  };
};

describe('swap', function () {
  it('should revert with OneInputRequired if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const swap = ramm.connect(member).swap(0, 0, 0, { value: 0 });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'OneInputRequired');
  });

  it('should revert with OneInputOnly if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    const swap = ramm.connect(member).swap(nxmIn, 0, 0, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'OneInputOnly');
  });

  it('should revert with SwapExpired if block timestamp surpasses deadline', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 ETH initial spot price

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp - 1;

    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'SwapExpired');
  });

  it('should revert with InsufficientAmountOut if nxmOut < minAmountOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('29'); // 1ETH = 28.8NXM at 0.0347ETH

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');
  });

  it('should revert with InsufficientAmountOut if ethOut < minAmountOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.016'); // 0.0152 ETH initial spot price

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');
  });

  it('should revert with NoSwapsInBufferZone if swapping NXM for ETH is in the buffer zone', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, mcr, pool } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('10000');
    const minAmountOut = parseEther('147');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    // Set MCR so it reaches the buffer zone (> capital - ethOut)
    const capital = await pool.getPoolValueInEth();
    await mcr.updateMCR(capital.sub(minAmountOut));

    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'NoSwapsInBufferZone');
  });

  it('should revert with EthTransferFailed if failed to send ETH', async function () {
    const setupPoolRejectEth = () => setup('RammMockPoolEtherRejecter');
    const fixture = await loadFixture(setupPoolRejectEth);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28.8');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    const swap = ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'EthTransferFailed');
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB
    await nxm.connect(member).approve(tokenController.address, nxmIn);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 7 * 60 * 60;
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;

    const initialState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const before = await getSupplyAndBalances(tokenController, nxm, member.address);
    const state = await ramm._getReserves(initialState, capital, supply, mcrValue, nextBlockTimestamp);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    await ramm.connect(member).swap(nxmIn, minAmountOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getSupplyAndBalances(tokenController, nxm, member.address);
    const stateAfter = await getState(ramm);

    // expected state
    const currentLiquidity = state.eth;
    const newNxmB = state.nxmB.add(nxmIn);
    const newLiquidity = currentLiquidity.mul(state.nxmB).div(newNxmB);
    const newNxmA = state.nxmA.mul(newLiquidity).div(currentLiquidity);
    const ethOut = currentLiquidity.sub(newLiquidity);

    expect(after.totalSupply).to.be.equal(before.totalSupply.sub(nxmIn));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn));
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('31');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 7 * 60 * 60;
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;

    const initialState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const state = await ramm._getReserves(initialState, capital, supply, mcrValue, nextBlockTimestamp);
    const before = await getSupplyAndBalances(tokenController, nxm, member.address);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    await ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    // after state
    const after = await getSupplyAndBalances(tokenController, nxm, member.address);
    const stateAfter = await getState(ramm);

    // expected states
    const currentLiquidity = state.eth;
    const newLiquidity = currentLiquidity.add(ethIn);
    const newNxmA = currentLiquidity.mul(state.nxmA).div(newLiquidity);
    const newNxmB = state.nxmB.mul(newLiquidity).div(currentLiquidity);
    const nxmOut = state.nxmA.sub(newNxmA);

    expect(after.totalSupply).to.be.equal(before.totalSupply.add(nxmOut));
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });
});
