const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { getState, setup } = require('./setup');
const { getReserves } = require('../../utils/getReserves');
const { setNextBlockTime, mineNextBlock } = require('../../utils/evm');

const { parseEther } = ethers.utils;

describe('swap', function () {
  it('should revert if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(ramm.connect(member).swap(0, 0, { value: 0 })).to.be.revertedWith('ONE_INPUT_REQUIRED');
  });

  it('should revert if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    await expect(ramm.connect(member).swap(nxmIn, 0, { value: ethIn })).to.be.revertedWith('ONE_INPUT_ONLY');
  });

  it('should revert if nxmOut < minTokensOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minTokensOut = parseEther('29'); // 1ETH = 28.8NXM at 0.0347ETH

    await expect(ramm.connect(member).swap(0, minTokensOut, { value: ethIn })).to.be.revertedWith(
      'Ramm: nxmOut is less than minTokensOut',
    );
  });

  it('should revert if ethOut < minTokensOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minTokensOut = parseEther('0.016'); // 0.0152 ETH initial spot price

    await expect(ramm.connect(member).swap(nxmIn, minTokensOut)).to.be.revertedWith(
      'Ramm: ethOut is less than minTokensOut',
    );
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp - 2);
    await mineNextBlock();

    const nxmIn = parseEther('1');
    const currentState = await getState(ramm);
    const state = await getReserves(currentState, pool, tokenController, nextBlockTimestamp);

    const currentLiquidity = state.eth;

    await nxm.connect(member).approve(tokenController.address, nxmIn);

    // before state
    const totalSupplyBefore = await tokenController.totalSupply();
    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    const tx = await ramm.connect(member).swap(nxmIn, parseEther('0.015')); // initial sportPriceB 0.0152
    const { gasUsed, effectiveGasPrice } = await tx.wait();

    // after state
    const totalSupplyAfter = await tokenController.totalSupply();
    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const stateAfter = await getState(ramm);

    // expected state
    const newNxmB = state.nxmB.add(nxmIn);
    const newLiquidity = currentLiquidity.mul(state.nxmB).div(newNxmB);
    const newNxmA = state.nxmA.mul(newLiquidity).div(currentLiquidity);
    const ethOut = currentLiquidity.sub(newLiquidity);

    expect(totalSupplyAfter).to.be.equal(totalSupplyBefore.sub(nxmIn));
    expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.sub(nxmIn));
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.add(ethOut).sub(gasUsed.mul(effectiveGasPrice)));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 6 * 60 * 60;
    await setNextBlockTime(nextBlockTimestamp - 1);
    await mineNextBlock();

    const ethIn = parseEther('1');
    const currentState = await getState(ramm);
    const state = await getReserves(currentState, pool, tokenController, nextBlockTimestamp);
    const currentLiquidity = state.eth;

    // before state
    const totalSupplyBefore = await tokenController.totalSupply();
    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    const tx = await ramm.connect(member).swap(0, parseEther('31'), { value: ethIn });
    const { gasUsed, effectiveGasPrice } = await tx.wait();
    await mineNextBlock();

    // after state
    const totalSupplyAfter = await tokenController.totalSupply();
    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);
    const stateAfter = await getState(ramm);

    // expected states
    const newLiquidity = currentLiquidity.add(ethIn);
    const newNxmA = currentLiquidity.mul(state.nxmA).div(newLiquidity);
    const newNxmB = state.nxmB.mul(newLiquidity).div(currentLiquidity);
    const nxmOut = state.nxmA.sub(newNxmA);

    expect(totalSupplyAfter).to.be.equal(totalSupplyBefore.add(nxmOut));
    expect(ethBalanceAfter).to.be.equal(ethBalanceBefore.sub(ethIn).sub(gasUsed.mul(effectiveGasPrice)));
    expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(nxmOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });
});
