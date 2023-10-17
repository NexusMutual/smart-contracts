const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getState, setup } = require('./setup');
const { setNextBlockBaseFee, setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;

describe('swap', function () {
  it('should revert if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(ramm.connect(member).swap(0, 0, 0, { value: 0 })).to.be.revertedWith('ONE_INPUT_REQUIRED');
  });

  it('should revert if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    await expect(ramm.connect(member).swap(nxmIn, 0, 0, { value: ethIn })).to.be.revertedWith('ONE_INPUT_ONLY');
  });

  it('should revert if block timestamp surpasses deadline', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minTokensOut = parseEther('0.015'); // 0.0152 ETH initial spot price
    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 4 * 60; // add 5 minutes
    setNextBlockTime(timestamp + 5 * 60);

    await expect(ramm.connect(member).swap(nxmIn, minTokensOut, deadline)).to.be.revertedWith('EXPIRED');
  });

  it('should revert if nxmOut < minTokensOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minTokensOut = parseEther('29'); // 1ETH = 28.8NXM at 0.0347ETH

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes
    setNextBlockTime(timestamp + 4 * 60);

    await expect(ramm.connect(member).swap(0, minTokensOut, deadline, { value: ethIn })).to.be.revertedWith(
      'Ramm: nxmOut is less than minTokensOut',
    );
  });

  it('should revert if ethOut < minTokensOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minTokensOut = parseEther('0.016'); // 0.0152 ETH initial spot price

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;
    setNextBlockTime(timestamp + 4 * 60);

    await expect(ramm.connect(member).swap(nxmIn, minTokensOut, deadline)).to.be.revertedWith(
      'Ramm: ethOut is less than minTokensOut',
    );
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    await nxm.connect(member).approve(tokenController.address, nxmIn);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 7 * 60 * 60; // add 5 minutes
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;

    const initialState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const state = await ramm._getReserves(initialState, capital, supply, mcrValue, nextBlockTimestamp);

    // before state
    const totalSupplyBefore = await tokenController.totalSupply();
    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    // 0.0152 spotB
    const tx = await ramm.connect(member).swap(nxmIn, parseEther('0.015'), deadline, { maxPriorityFeePerGas: 0 });
    await tx.wait();

    // after state
    const totalSupplyAfter = await tokenController.totalSupply();
    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const stateAfter = await getState(ramm);

    // expected state
    const currentLiquidity = state.eth;
    const newNxmB = state.nxmB.add(nxmIn);
    const newLiquidity = currentLiquidity.mul(state.nxmB).div(newNxmB);
    const newNxmA = state.nxmA.mul(newLiquidity).div(currentLiquidity);
    const ethOut = currentLiquidity.sub(newLiquidity);

    expect(totalSupplyAfter).to.be.equal(totalSupplyBefore.sub(nxmIn));
    expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.sub(nxmIn));
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(ethOut));

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

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 7 * 60 * 60;
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;

    const initialState = await getState(ramm);
    const capital = await pool.getPoolValueInEth();
    const supply = await tokenController.totalSupply();
    const mcrValue = await mcr.getMCR();

    const state = await ramm._getReserves(initialState, capital, supply, mcrValue, nextBlockTimestamp);

    // before state
    const totalSupplyBefore = await tokenController.totalSupply();
    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    const tx = await ramm
      .connect(member)
      .swap(0, parseEther('31'), deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    await tx.wait();

    // after state
    const totalSupplyAfter = await tokenController.totalSupply();
    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const stateAfter = await getState(ramm);

    // expected states
    const currentLiquidity = state.eth;
    const newLiquidity = currentLiquidity.add(ethIn);
    const newNxmA = currentLiquidity.mul(state.nxmA).div(newLiquidity);
    const newNxmB = state.nxmB.mul(newLiquidity).div(currentLiquidity);
    const nxmOut = state.nxmA.sub(newNxmA);

    expect(totalSupplyAfter).to.be.equal(totalSupplyBefore.add(nxmOut));
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(ethIn));
    expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(nxmOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });
});
