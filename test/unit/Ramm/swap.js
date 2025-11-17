const { ethers, artifacts, nexus } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, time } = require('@nomicfoundation/hardhat-network-helpers');

const { calculateEthToExtract, calculateEthToInject, setEthReserveValue } = require('./rammCalculations');
const { setup } = require('./setup');
const { setCode, setNextBlockBaseFee } = require('../utils');

const { parseEther } = ethers;
const { PauseTypes } = nexus.constants;

/**
 * Retrieves NXM totalSupply as well as NXM and ETH balances for a given member address
 *
 * @param {Contract} tokenController - The token controller contract
 * @param {Contract} token - The NXM token contract
 * @param {string} memberAddress - The address of the member
 * @return {Object} An object containing the totalSupply, nxmBalance, and ethBalance
 */
const getSupplyAndBalances = async (tokenController, token, memberAddress) => {
  return {
    totalSupply: await tokenController.totalSupply(),
    nxmBalance: await token.balanceOf(memberAddress),
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
const getStateAtBlockTimestamp = async (ramm, pool, tokenController, blockTimestamp) => {
  const initialState = await ramm.loadState();
  const context = {
    capital: await pool.getPoolValueInEth(),
    supply: await tokenController.totalSupply(),
    mcr: await pool.getMCR(),
  };
  const [stateResult] = await ramm._getReserves(initialState.toObject(), context, blockTimestamp);
  const state = stateResult.toObject ? stateResult.toObject() : stateResult;
  return state;
};

/**
 * Calculates the expected state after swapping NXM for ETH
 *
 * @param {State} state - The current state object
 * @param {bigint} nxmIn - The amount of NXM to swap
 * @return {object} - The new state object with the expected values
 */
const getExpectedStateAfterSwapNxmForEth = (state, nxmIn) => {
  const currentEthLiquidity = state.eth;
  const newNxmB = state.nxmB + nxmIn;
  const newEthLiquidity = (currentEthLiquidity * state.nxmB) / newNxmB;
  return {
    newNxmB,
    newEthLiquidity,
    newNxmA: (state.nxmA * newEthLiquidity) / currentEthLiquidity,
    ethOut: currentEthLiquidity - newEthLiquidity,
  };
};

/**
 * Calculates the expected state after swapping ETH for NXM
 *
 * @param {State} state - The current state object
 * @param {bigint} ethIn - The amount of ETH to swap
 * @return {object} - The new state object with the expected values
 */
const getExpectedStateAfterSwapEthForNxm = (state, ethIn) => {
  const currentEthLiquidity = state.eth;
  const newEthLiquidity = currentEthLiquidity + ethIn;
  const newNxmA = (currentEthLiquidity * state.nxmA) / newEthLiquidity;
  return {
    newEthLiquidity,
    newNxmA,
    newNxmB: (state.nxmB * newEthLiquidity) / currentEthLiquidity,
    nxmOut: state.nxmA - newNxmA,
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

    const timestamp = await time.latest();
    const deadline = timestamp - 1;

    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'SwapExpired');
  });

  it('should revert with InsufficientAmountOut if nxmOut < minAmountOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, timestamp + 1);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    await time.setNextBlockTimestamp(timestamp + 1);

    const swap = ramm.connect(member).swap(0, nxmOut + 1n, deadline, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');
  });

  it('should revert with InsufficientAmountOut if ethOut < minAmountOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;
    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, timestamp + 1);
    const { ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);

    await time.setNextBlockTimestamp(timestamp + 1);
    const swap = ramm.connect(member).swap(nxmIn, ethOut + 1n, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');
  });

  it('should revert with NoSwapsInBufferZone if swapping NXM for ETH is in the buffer zone', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('10000');

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;
    const amountOut = await ramm.connect(member).swap.staticCall(nxmIn, 0, deadline);

    // Set MCR so it reaches the buffer zone (> capital - ethOut)
    const capital = await pool.getPoolValueInEth();
    await pool.setMCR(capital - amountOut);

    const swap = ramm.connect(member).swap(nxmIn, amountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'NoSwapsInBufferZone');
  });

  it('should revert with EthTransferFailed if failed to send ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;
    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, timestamp + 1);

    const { deployedBytecode: ethRejecterBytecode } = await artifacts.readArtifact('PoolEtherRejecterMock');
    await setCode(pool.target, ethRejecterBytecode);

    await time.setNextBlockTimestamp(timestamp + 1);

    const ethIn = parseEther('1');
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    const swap = ramm.connect(member).swap(0, nxmOut, deadline, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'EthTransferFailed');
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB
    await token.connect(member).approve(tokenController.target, nxmIn);

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const before = await getSupplyAndBalances(tokenController, token, member.address);
    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);

    await setNextBlockBaseFee(0);
    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.connect(member).swap(nxmIn, minAmountOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getSupplyAndBalances(tokenController, token, member.address);
    const stateAfter = await ramm.loadState();

    const { newNxmA, newNxmB, newEthLiquidity, ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);
    expect(after.totalSupply).to.be.equal(before.totalSupply - nxmIn);
    expect(after.nxmBalance).to.be.equal(before.nxmBalance - nxmIn);
    expect(after.ethBalance).to.be.equal(before.ethBalance + ethOut);

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newEthLiquidity);
    expect(stateAfter.timestamp).to.be.equal(BigInt(nextBlockTimestamp));
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const before = await getSupplyAndBalances(tokenController, token, member.address);
    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { newEthLiquidity, newNxmA, newNxmB, nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    await setNextBlockBaseFee(0);
    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.connect(member).swap(0, nxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    // after state
    const after = await getSupplyAndBalances(tokenController, token, member.address);
    const stateAfter = await ramm.loadState();

    expect(after.totalSupply).to.be.equal(before.totalSupply + nxmOut);
    expect(after.ethBalance).to.be.equal(before.ethBalance - ethIn);
    expect(after.nxmBalance).to.be.equal(before.nxmBalance + nxmOut);

    expect(stateAfter.nxmA).to.be.equal(newNxmA);
    expect(stateAfter.nxmB).to.be.equal(newNxmB);
    expect(stateAfter.eth).to.be.equal(newEthLiquidity);
    expect(stateAfter.timestamp).to.be.equal(BigInt(nextBlockTimestamp));
  });

  it('should return the ethOut value when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, timestamp);
    const expectedEthOut = getExpectedStateAfterSwapNxmForEth(state, nxmIn).ethOut;

    const ethOut = await ramm.connect(member).swap.staticCall(nxmIn, minAmountOut, deadline);
    expect(ethOut).to.be.equal(expectedEthOut);
  });

  it('should return the nxmOut value when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, timestamp);
    const expectedNxmOut = getExpectedStateAfterSwapEthForNxm(state, ethIn).nxmOut;

    const nxmOut = await ramm.connect(member).swap.staticCall(0, expectedNxmOut, deadline, { value: ethIn });
    expect(nxmOut).to.be.equal(expectedNxmOut);
  });

  it('should emit NxmSwappedForEth when successfully swapped NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    const swap = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.emit(ramm, 'NxmSwappedForEth').withArgs(member.address, nxmIn, ethOut);
  });

  it('should emit EthSwappedForNxm when successfully swapped ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    const swap = ramm.connect(member).swap(0, nxmOut, deadline, { value: ethIn });
    await expect(swap).to.emit(ramm, 'EthSwappedForNxm').withArgs(member.address, ethIn, nxmOut);
  });

  it('should revert when both RAMM and GLOBAL is paused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await registry.confirmPauseConfig(PauseTypes.PAUSE_GLOBAL | PauseTypes.PAUSE_RAMM);

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'Paused');
  });

  it('should revert when RAMM is NOT paused and GLOBAL is paused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await registry.confirmPauseConfig(PauseTypes.PAUSE_GLOBAL);

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'Paused');
  });

  it('should revert when RAMM is paused and GLOBAL is NOT paused', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, registry } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await registry.confirmPauseConfig(PauseTypes.PAUSE_RAMM);

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const swap = ramm.connect(member).swap(parseEther('1'), parseEther('0.015'), deadline);
    await expect(swap).to.be.revertedWithCustomError(ramm, 'Paused');
  });

  it('should revert on reentrancy', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, tokenController } = fixture.contracts;

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60; // add 5 minutes

    // set up reentrancyExploiter
    const ReentrancyExploiter = await ethers.getContractFactory('ReentrancyExploiter');
    const reentrancyExploiter = await ReentrancyExploiter.deploy();
    const swapData = ramm.interface.encodeFunctionData('swap', [parseEther('1'), parseEther('0.015'), deadline]);
    await reentrancyExploiter.setReentrancyParams(ramm.target, 0, swapData);

    // approve without reentering
    await token.mint(reentrancyExploiter.target, parseEther('10000'));
    const approveData = token.interface.encodeFunctionData('approve', [tokenController.target, parseEther('10000')]);
    await reentrancyExploiter.execute(token.target, 0, approveData);

    const reentrancyAttackPromise = reentrancyExploiter.execute(ramm.target, 0, swapData);
    await expect(reentrancyAttackPromise).to.be.reverted;
  });

  it('should increase eth circuit breaker accumulator ethReleased', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 spotB

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 10;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);

    const ethReleasedBefore = await ramm.ethReleased();

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.connect(member).swap(nxmIn, minAmountOut, deadline);

    const ethReleasedAfter = await ramm.ethReleased();
    const expectedEthReleasedAfter = ethReleasedBefore + ethOut;

    expect(ethReleasedAfter).to.be.equal(expectedEthReleasedAfter);
  });

  it('should increase nxm circuit breaker accumulator nxmReleased', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('0');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 10;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    const nxmReleasedBefore = await ramm.nxmReleased();

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    await ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });

    const nxmReleasedAfter = await ramm.nxmReleased();
    const expectedNxmReleasedAfter = nxmReleasedBefore + nxmOut;

    expect(nxmReleasedAfter).to.be.equal(expectedNxmReleasedAfter);
  });

  it('should revert when the eth circuit breaker is hit', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governor] = fixture.accounts.governanceContracts;

    const nxmIn = parseEther('1000');
    const minAmountOut = parseEther('0');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 10;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { ethOut } = getExpectedStateAfterSwapNxmForEth(state, nxmIn);

    await ramm.connect(governor).setCircuitBreakerLimits(ethOut / parseEther('1') - 1n, 0);

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    const swapTx = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swapTx).to.revertedWithCustomError(ramm, 'EthCircuitBreakerHit');
  });

  it('should revert when nxm circuit breaker is hit', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;
    const [governor] = fixture.accounts.governanceContracts;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('0');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 10;
    const deadline = nextBlockTimestamp + 5 * 60;

    const state = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(state, ethIn);

    await ramm.connect(governor).setCircuitBreakerLimits(0, nxmOut / parseEther('1') - 1n);

    await time.setNextBlockTimestamp(nextBlockTimestamp);
    const swapTx = ramm.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });
    await expect(swapTx).to.revertedWithCustomError(ramm, 'NxmCircuitBreakerHit');
  });

  it('should revert when nxm is locked for member voting', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1000');
    const minAmountOut = parseEther('0');

    await token.setLock(member.address, 3600 * 24); // lock for 24h since now

    const timestamp = await time.latest();
    const deadline = timestamp + 5 * 60;

    const swapTx = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swapTx).to.revertedWithCustomError(ramm, 'LockedForVoting');
  });

  it('should emit EthInjected with the correct ETH injected value - swapNxmForEth', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.0152');
    await token.connect(member).approve(tokenController.target, nxmIn);

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.target, 4999);

    const state = await ramm.loadState();
    const expectedInjected = calculateEthToInject(state.toObject(), nextBlockTimestamp, fixture.constants);

    const swapNxmForEth = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swapNxmForEth).to.emit(ramm, 'EthInjected').withArgs(expectedInjected);
  });

  it('should emit EthExtracted with the correct ETH extracted value - swapNxmForEth', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.0152');
    await token.connect(member).approve(tokenController.target, nxmIn);

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    // Set ETH reserve > TARGET_LIQUIDITY (5000) to force extraction
    await setEthReserveValue(ramm.target, 5001);

    const state = await ramm.loadState();
    const expectedExtracted = calculateEthToExtract(state.toObject(), nextBlockTimestamp, fixture.constants);

    const swapNxmForEth = ramm.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swapNxmForEth).to.emit(ramm, 'EthExtracted').withArgs(expectedExtracted);
  });

  it('should emit EthInjected with the correct ETH injected value - swapEthForNxm', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.target, 4999);
    const stateForCalc = await getStateAtBlockTimestamp(ramm, pool, tokenController, nextBlockTimestamp);
    const { nxmOut } = getExpectedStateAfterSwapEthForNxm(stateForCalc, ethIn);

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    // Set ETH reserve < TARGET_LIQUIDITY (5000) to force injection
    await setEthReserveValue(ramm.target, 4999);

    const state = await ramm.loadState();
    const expectedInjected = calculateEthToInject(state.toObject(), nextBlockTimestamp, fixture.constants);

    const swapEthForNxm = ramm.connect(member).swap(0, nxmOut, deadline, { value: ethIn });
    await expect(swapEthForNxm).to.emit(ramm, 'EthInjected').withArgs(expectedInjected);
  });

  it('should emit EthExtracted with the correct ETH extracted value - swapEthForNxm', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 5 * 60;
    const deadline = nextBlockTimestamp + 5 * 60;

    await time.setNextBlockTimestamp(nextBlockTimestamp);

    // Set ETH reserve > TARGET_LIQUIDITY (5000) to force extraction
    await setEthReserveValue(ramm.target, 5001);

    const state = await ramm.loadState();
    const expectedExtracted = calculateEthToExtract(state.toObject(), nextBlockTimestamp, fixture.constants);

    const swapEthForNxm = ramm.connect(member).swap(0, 0, deadline, { value: ethIn });
    await expect(swapEthForNxm).to.emit(ramm, 'EthExtracted').withArgs(expectedExtracted);
  });
});
