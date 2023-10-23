const { ethers, artifacts } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { getState, setup } = require('./setup');
const { setNextBlockBaseFee, setNextBlockTime, setCode } = require('../utils').evm;

const { parseEther } = ethers.utils;

/**
 * Retrieves NXM totalSupply as well as NXM and ETH balances for a given member address
 *
 * @param {Contract} tokenController - The token controller contract
 * @param {Contract} nxm - The NXM token contract
 * @param {string} memberAddress - The address of the member
 * @return {Object} An object containing the totalSupply, nxmBalance, and ethBalance
 */
const getSupplyAndBalances = async (tokenController, nxm, memberAddress) => {
  return {
    totalSupply: await tokenController.totalSupply(),
    nxmBalance: await nxm.balanceOf(memberAddress),
    ethBalance: await ethers.provider.getBalance(memberAddress),
  };
};

/**
 * Retrieves the state at a specific block timestamp
 *
 * @param {Contract} ramm - The RAMM contract
 * @param {Contract} pool - The pool contract
 * @param {Contract} tokenController - The tokenController contract
 * @param {number} blockTimestamp - The block timestamp to retrieve the state at
 * @return {State} Object containing the state (nxmA, nxmB, eth, budget, ratchetSpeed, timestamp)
 *                 at the specified block timestamp
 */
const getStateAtBlockTimestamp = async (ramm, pool, mcr, tokenController, blockTimestamp) => {
  const initialState = await getState(ramm);
  const capital = await pool.getPoolValueInEth();
  const supply = await tokenController.totalSupply();
  const mcrValue = await mcr.getMCR();
  return ramm._getReserves(initialState, capital, supply, mcrValue, blockTimestamp);
};

/**
 * Calculates the expected state after swapping NXM for ETH
 *
 * @param {State} state - The current state object
 * @param {BigNumber} nxmIn - The amount of NXM to swap
 * @return {object} - The new state object with the expected values
 */
const getExpectedStateAfterSwapNxmForEth = (state, nxmIn) => {
  const currentEthLiquidity = state.eth;
  const newNxmB = state.nxmB.add(nxmIn);
  const newEthLiquidity = currentEthLiquidity.mul(state.nxmB).div(newNxmB);
  return {
    newNxmB,
    newEthLiquidity,
    newNxmA: state.nxmA.mul(newEthLiquidity).div(currentEthLiquidity),
    ethOut: currentEthLiquidity.sub(newEthLiquidity),
  };
};

/**
 * Calculates the expected state after swapping ETH for NXM
 *
 * @param {State} state - The current state object
 * @param {BigNumber} ethIn - The amount of ETH to swap
 * @return {object} - The new state object with the expected values
 */
const getExpectedStateAfterSwapEthForNxm = (state, ethIn) => {
  const currentEthLiquidity = state.eth;
  const newEthLiquidity = currentEthLiquidity.add(ethIn);
  const newNxmA = currentEthLiquidity.mul(state.nxmA).div(newEthLiquidity);
  return {
    newEthLiquidity,
    newNxmA,
    newNxmB: state.nxmB.mul(newEthLiquidity).div(currentEthLiquidity),
    nxmOut: state.nxmA.sub(newNxmA),
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
    const fixture = await loadFixture(setup);
    const { ramm, pool } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const { deployedBytecode: ethRejecterBytecode } = await artifacts.readArtifact('RammMockPoolEtherRejecter');
    await setCode(pool.address, ethRejecterBytecode);

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
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const before = await getSupplyAndBalances(tokenController, nxm, member.address);
    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, nextBlockTimestamp);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    await ramm.connect(member).swap(nxmIn, minAmountOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getSupplyAndBalances(tokenController, nxm, member.address);
    const stateAfter = await getState(ramm);

    const { newNxmA, newNxmB, newEthLiquidity, ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);
    expect(after.totalSupply).to.be.equal(before.totalSupply.sub(nxmIn));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn));
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newEthLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, pool, tokenController, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28.8');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const before = await getSupplyAndBalances(tokenController, nxm, member.address);
    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, nextBlockTimestamp);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    await ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    // after state
    const after = await getSupplyAndBalances(tokenController, nxm, member.address);
    const stateAfter = await getState(ramm);

    const { newEthLiquidity, newNxmA, newNxmB, nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);
    expect(after.totalSupply).to.be.equal(before.totalSupply.add(nxmOut));
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut));

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newEthLiquidity);
    expect(stateAfter.timestamp).to.be.equal(nextBlockTimestamp);
  });

  it('should return the ethOut value when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, mcr, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, timestamp);
    const expectedEthOut = getExpectedStateAfterSwapNxmForEth(state, nxmIn).ethOut;

    await setNextBlockBaseFee(0);
    const txParams = { maxPriorityFeePerGas: 0 };
    const ethOut = await ramm.connect(member).callStatic.swap(nxmIn, minAmountOut, deadline, txParams);

    expect(ethOut).to.be.equal(expectedEthOut);
  });

  it('should return the nxmOut value when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, mcr, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28.8');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, timestamp);
    const expectedNxmOut = getExpectedStateAfterSwapEthForNxm(state, ethIn).nxmOut;

    await setNextBlockBaseFee(0);
    const txParams = { value: ethIn, maxPriorityFeePerGas: 0 };
    const nxmOut = await ramm.connect(member).callStatic.swap(0, minAmountOut, deadline, txParams);

    expect(nxmOut).to.be.equal(expectedNxmOut);
  });

  it('should emit NxmSwappedForEth when successfully swapped NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, mcr, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, nextBlockTimestamp);
    const { ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);

    await setNextBlockTime(nextBlockTimestamp);
    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline, { maxPriorityFeePerGas: 0 });
    await expect(swap).to.emit(ramm, 'NxmSwappedForEth').withArgs(member.address, nxmIn, ethOut);
  });

  it('should emit EthSwappedForNxm when successfully swapped ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, mcr, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('28.8');

    const { timestamp } = await ethers.provider.getBlock('latest');
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, mcr, tokenController, nextBlockTimestamp);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    await setNextBlockTime(nextBlockTimestamp);
    const swap = ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    await expect(swap).to.emit(ramm, 'EthSwappedForNxm').withArgs(member.address, ethIn, nxmOut);
  });

  it('should revert when both SWAP and SYSTEM is paused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, master } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { emergencyAdmin } = fixture.accounts;

    const paused = true;
    await master.connect(emergencyAdmin).setEmergencyPause(paused);
    await ramm.connect(emergencyAdmin).setEmergencySwapPause(paused);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'SystemPaused');
  });

  it('should revert when SWAP is NOT paused and SYSTEM is paused ', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, master } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { emergencyAdmin } = fixture.accounts;

    const paused = true;
    await master.connect(emergencyAdmin).setEmergencyPause(paused);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'SystemPaused');
  });

  it('should revert when SWAP is paused and SYSTEM is NOT paused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const { emergencyAdmin } = fixture.accounts;

    const paused = true;
    await ramm.connect(emergencyAdmin).setEmergencySwapPause(paused);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'SwapPaused');
  });

  it('should revert on reentrancy', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, tokenController } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    // Set up re-entrancy attack
    const ReentrancyExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrancyExploiter = await ReentrancyExploiter.deploy();
    const { data: swapData } = await ramm.populateTransaction.swap(parseEther('1'), parseEther('0.015'), deadline);

    // approve without reentering
    await nxm.mint(reentrancyExploiter.address, parseEther('10000'));
    const { data: approveData } = await nxm.populateTransaction.approve(tokenController.address, parseEther('10000'));
    await reentrancyExploiter.execute([nxm.address], [0], [approveData]);

    // prepare reentrancy and execute
    await reentrancyExploiter.setFallbackParams([ramm.address], [0], [swapData]);
    const reentrancyAttackPromise = reentrancyExploiter.execute([ramm.address], [0], [swapData]);
    await expect(reentrancyAttackPromise).to.be.revertedWith('ReentrancyGuard: reentrant call');
  });
});
