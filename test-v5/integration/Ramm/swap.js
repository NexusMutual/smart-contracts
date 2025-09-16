const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { setNextBlockBaseFee, setNextBlockTime, setEtherBalance } = require('../../utils/evm');
const { getEventsFromTxReceipt } = require('../../utils/events');

const { parseEther } = ethers.utils;

async function getCapitalSupplyAndBalances(p1, tc, tk, memberAddress) {
  return {
    ethCapital: await p1.getPoolValueInEth(),
    nxmSupply: await tc.totalSupply(),
    ethBalance: await ethers.provider.getBalance(memberAddress),
    nxmBalance: await tk.balanceOf(memberAddress),
  };
}

async function swapSetup() {
  const fixture = await loadFixture(setup);
  const { tk, p1, tc } = fixture.contracts;
  const [member1] = fixture.accounts.members;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000'));
  await setEtherBalance(member1.address, parseEther('10000'));
  await setEtherBalance(p1.address, parseEther('145000'));

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('10000'));
  await tk.connect(member1).approve(tc.address, parseEther('10000'));

  return fixture;
}

describe('swap', function () {
  it('should revert if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(swapSetup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const swap = ra.connect(member).swap(0, 0, 0, { value: 0 });
    await expect(swap).to.be.revertedWithCustomError(ra, 'OneInputRequired');
  });

  it('should revert if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    const swap = ra.connect(member).swap(nxmIn, 0, 0, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ra, 'OneInputOnly');
  });

  it('should revert if nxmOut < minAmountOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ra, p1, tc, tk, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const { timestamp } = await ethers.provider.getBlock('latest');
    // +54 hours to reach above BV, this ensures price is stable between the 2 swaps below
    const nextBlockTimestamp = timestamp + 54 * 60 * 60;
    const deadline = nextBlockTimestamp + 15 * 60; // add 15 minutes

    // Get expected book value
    const initState = await ra.loadState();
    const context = {
      capital: await p1.getPoolValueInEth(),
      supply: await tc.totalSupply(),
      mcr: await mcr.getMCR(),
    };
    const [state] = await ra._getReserves(initState, context, nextBlockTimestamp);
    const k = state.eth.mul(state.nxmA);
    const eth = state.eth.add(ethIn);
    const nxmA = k.div(eth);
    const expectedNxmOut = state.nxmA.sub(nxmA);

    // Insufficient Amount Out Error
    const minNxmOutFail = expectedNxmOut.add(1);
    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp + 2 * 60);
    const swapFail = ra.connect(member).swap(0, minNxmOutFail, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    await expect(swapFail).to.be.revertedWithCustomError(ra, 'InsufficientAmountOut');

    // Minimum Amount Out Success
    const minNxmOutSuccess = expectedNxmOut;
    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp + 3 * 60);
    const tx = await ra.connect(member).swap(0, minNxmOutSuccess, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferEvents = getEventsFromTxReceipt(swapTxReceipt, tk, 'Transfer', {
      from: ethers.constants.AddressZero,
      to: member.address,
    });
    const nxmTransferAmount = nxmTransferEvents[0]?.args?.value;

    expect(after.ethCapital).to.be.equal(before.ethCapital.add(ethIn)); // ETH goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // NXM out is minted
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmTransferAmount)); // member receives NXM
  });

  it('should revert if ethOut < minAmountOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra, p1, tc, tk, mcr } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');

    const { timestamp } = await ethers.provider.getBlock('latest');
    // +3 hours to reach below BV, this ensures price is stable between the 2 swaps below
    const nextBlockTimestamp = timestamp + 3 * 60 * 60;
    const deadline = nextBlockTimestamp + 15 * 60; // add 15 minutes

    // Get expected book value
    const initState = await ra.loadState();
    const context = {
      capital: await p1.getPoolValueInEth(),
      supply: await tc.totalSupply(),
      mcr: await mcr.getMCR(),
    };
    const [state] = await ra._getReserves(initState, context, nextBlockTimestamp);
    const k = state.eth.mul(state.nxmB);
    const nxmB = state.nxmB.add(nxmIn);
    const eth = k.div(nxmB);
    const expectedEthOut = state.eth.sub(eth);

    // Insufficient Amount Out Error
    const minEthOutFail = expectedEthOut.add(1);
    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp);
    const swapFail = ra.connect(member).swap(nxmIn, minEthOutFail, deadline, { maxPriorityFeePerGas: 0 });
    await expect(swapFail).to.be.revertedWithCustomError(ra, 'InsufficientAmountOut');

    // Minimum Amount Out Success
    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    await setNextBlockBaseFee(0);
    await setNextBlockTime(nextBlockTimestamp + 3 * 60);
    await ra.connect(member).swap(nxmIn, expectedEthOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const ethReceived = after.ethBalance.sub(before.ethBalance);

    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital.sub(ethReceived)); // ETH goes out of capital pool
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethReceived)); // member receives ETH
  });

  it('should revert if block timestamp surpasses deadline', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.015'); // 0.0152 ETH initial spot price
    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp - 1;

    const swap = ra.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ra, 'SwapExpired');
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ra, tk, p1, tc } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.8');
    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 15 * 60; // add 15 minutes

    await setNextBlockBaseFee(0);
    const tx = await ra.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferEvents = getEventsFromTxReceipt(swapTxReceipt, tk, 'Transfer', {
      from: ethers.constants.AddressZero,
      to: member.address,
    });
    const nxmOut = nxmTransferEvents[0]?.args?.value;

    expect(after.ethCapital).to.be.equal(before.ethCapital.add(ethIn)); // ETH goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // NXM out is minted
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmOut)); // member receives NXM
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra, p1, tc, tk } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.0152');
    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 15 * 60; // add 15 minutes

    await setNextBlockBaseFee(0);
    const tx = await ra.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const ethReceived = after.ethBalance.sub(before.ethBalance);

    const nxmSwappedForEthEvents = getEventsFromTxReceipt(swapTxReceipt, ra, 'NxmSwappedForEth', {
      member: member.address,
    });
    const ethOut = nxmSwappedForEthEvents[0]?.args?.ethOut;

    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital.sub(ethReceived)); // ETH goes out of capital pool
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethOut)); // member receives ETH
  });
});
