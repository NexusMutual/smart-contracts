const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setNextBlockBaseFeePerGas, time } = require('@nomicfoundation/hardhat-network-helpers');

const { getEventsFromTxReceipt } = require('../utils/helpers');
const { calculateExpectedSwapOutput } = require('../utils');
const setup = require('../setup');

const { parseEther, ZeroAddress } = ethers;

async function getCapitalSupplyAndBalances(pool, tokenController, token, memberAddress) {
  return {
    ethCapital: await pool.getPoolValueInEth(),
    nxmSupply: await tokenController.totalSupply(),
    ethBalance: await ethers.provider.getBalance(memberAddress),
    nxmBalance: await token.balanceOf(memberAddress),
  };
}

describe('swap', function () {
  it('should revert if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const swap = ramm.connect(member).swap(0, 0, 0, { value: 0 });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'OneInputRequired');
  });

  it('should revert if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    const swap = ramm.connect(member).swap(nxmIn, 0, 0, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ramm, 'OneInputOnly');
  });

  it('should revert if nxmOut < minAmountOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, token } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 54 * 60 * 60; // +54 hours to stabilize price
    const deadline = nextBlockTimestamp + 15 * 60; // add 15 minutes

    // Get expected book value
    const failureTimestamp = nextBlockTimestamp + 2 * 60; // +2 minutes
    const isEthToNxm = true;
    const expectedNxmOut = await calculateExpectedSwapOutput(
      ramm,
      pool,
      tokenController,
      ethIn,
      isEthToNxm,
      failureTimestamp,
    );

    // InsufficientAmountOut (minNxmOut higher than expected)
    const minNxmOutFail = expectedNxmOut + 1n;
    await setNextBlockBaseFeePerGas(0);
    await time.setNextBlockTimestamp(failureTimestamp);
    const swapFail = ramm.connect(member).swap(0, minNxmOutFail, deadline, {
      value: ethIn,
      maxPriorityFeePerGas: 0,
    });
    await expect(swapFail).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');
    const before = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);

    // Min amount out success: +3 minutes enough for price to adjust and execute the swap
    await setNextBlockBaseFeePerGas(0);
    await time.setNextBlockTimestamp(nextBlockTimestamp + 3 * 60);
    const tx = await ramm.connect(member).swap(0, expectedNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);
    const nxmReceived = after.nxmBalance - before.nxmBalance;

    const [nxmTransferEvent] = getEventsFromTxReceipt(swapTxReceipt, token, 'Transfer', {
      from: ZeroAddress,
      to: member.address,
    });
    const nxmOut = nxmTransferEvent?.args?.value;

    expect(after.ethCapital).to.be.equal(before.ethCapital + ethIn); // ETH goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply + nxmReceived); // NXM out is minted
    expect(after.ethBalance).to.be.equal(before.ethBalance - ethIn); // member sends ETH
    expect(after.nxmBalance).to.be.equal(before.nxmBalance + nxmOut); // member receives NXM
  });

  it('should revert if ethOut < minAmountOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, token } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');

    const timestamp = await time.latest();
    const nextBlockTimestamp = timestamp + 3 * 60 * 60; // +3 hours to stabilize price
    const deadline = nextBlockTimestamp + 15 * 60; // add 15 minutes

    // Get expected book value
    const failureTimestamp = nextBlockTimestamp + 2 * 60; // +2 minutes
    const isEthToNxm = false;
    const expectedEthOut = await calculateExpectedSwapOutput(
      ramm,
      pool,
      tokenController,
      nxmIn,
      isEthToNxm,
      failureTimestamp,
    );

    // InsufficientAmountOut (minEthOut higher than expected)
    const minEthOutFail = expectedEthOut + 1n;
    await setNextBlockBaseFeePerGas(0);
    await time.setNextBlockTimestamp(failureTimestamp);
    const swapFail = ramm.connect(member).swap(nxmIn, minEthOutFail, deadline, {
      maxPriorityFeePerGas: 0,
    });
    await expect(swapFail).to.be.revertedWithCustomError(ramm, 'InsufficientAmountOut');

    const before = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);

    // Min amount out success: +3 minutes enough for price to adjust and execute the swap
    await setNextBlockBaseFeePerGas(0);
    await time.setNextBlockTimestamp(nextBlockTimestamp + 3 * 60);
    await ramm.connect(member).swap(nxmIn, expectedEthOut, deadline, {
      maxPriorityFeePerGas: 0,
    });

    const after = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);
    const ethReceived = after.ethBalance - before.ethBalance;

    expect(after.nxmSupply).to.be.equal(before.nxmSupply - nxmIn); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital - ethReceived); // ETH goes out of capital pool
    expect(after.nxmBalance).to.be.equal(before.nxmBalance - nxmIn); // member sends NXM
    expect(after.ethBalance).to.be.equal(before.ethBalance + ethReceived); // member receives ETH
  });

  it('should revert if block timestamp surpasses deadline', async function () {
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

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, token, pool, tokenController } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.8');
    const before = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);

    const timestamp = await time.latest();
    const deadline = timestamp + 15 * 60; // add 15 minutes

    await setNextBlockBaseFeePerGas(0);
    const tx = await ramm.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);
    const nxmReceived = after.nxmBalance - before.nxmBalance;
    const [nxmTransferEvent] = getEventsFromTxReceipt(swapTxReceipt, token, 'Transfer', {
      from: ZeroAddress,
      to: member.address,
    });
    const nxmOut = nxmTransferEvent?.args?.value;

    expect(after.ethCapital).to.be.equal(before.ethCapital + ethIn); // ETH goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply + nxmReceived); // NXM out is minted
    expect(after.ethBalance).to.be.equal(before.ethBalance - ethIn); // member sends ETH
    expect(after.nxmBalance).to.be.equal(before.nxmBalance + nxmOut); // member receives NXM
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, pool, tokenController, token } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const before = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);

    const isEthToNxm = false;
    const timestamp = await time.latest();
    const expectedEthOut = await calculateExpectedSwapOutput(ramm, pool, tokenController, nxmIn, isEthToNxm, timestamp);
    const deadline = timestamp + 15 * 60; // +15 minutes

    await setNextBlockBaseFeePerGas(0);
    const tx = await ramm.connect(member).swap(nxmIn, expectedEthOut, deadline, { maxPriorityFeePerGas: 0 });
    const swapTxReceipt = await tx.wait();

    const after = await getCapitalSupplyAndBalances(pool, tokenController, token, member.address);
    const ethReceived = after.ethBalance - before.ethBalance;
    const [nxmSwappedForEthEvent] = getEventsFromTxReceipt(swapTxReceipt, ramm, 'NxmSwappedForEth', {
      member: member.address,
    });
    const ethOut = nxmSwappedForEthEvent?.args?.ethOut;

    expect(after.nxmBalance).to.be.equal(before.nxmBalance - nxmIn); // member sends NXM
    expect(after.nxmSupply).to.be.equal(before.nxmSupply - nxmIn); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital - ethReceived); // ETH goes out of capital pool
    expect(after.ethBalance).to.be.equal(before.ethBalance + ethOut); // member receives ETH
  });
});
