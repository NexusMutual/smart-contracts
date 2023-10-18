const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { setNextBlockBaseFee, setEtherBalance } = require('../../utils/evm');

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

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));
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
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minAmountOut = parseEther('29'); // 1ETH = 28.8NXM at 0.0347ETH

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ra.connect(member).swap(0, minAmountOut, deadline, { value: ethIn });
    await expect(swap).to.be.revertedWithCustomError(ra, 'InsufficientAmountOut');
  });

  it('should revert if ethOut < minAmountOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minAmountOut = parseEther('0.016'); // 0.0152 ETH initial spot price

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    const swap = ra.connect(member).swap(nxmIn, minAmountOut, deadline);
    await expect(swap).to.be.revertedWithCustomError(ra, 'InsufficientAmountOut');
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
    const deadline = timestamp + 5 * 60; // add 5 minutes

    await setNextBlockBaseFee(0);
    await ra.connect(member).swap(0, minNxmOut, deadline, { value: ethIn, maxPriorityFeePerGas: 0 });

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const transferFilter = tk.filters.Transfer('0x0000000000000000000000000000000000000000', member.address);
    const nxmTransferEvents = await tk.queryFilter(transferFilter, -1);
    const nxmTransferAmount = nxmTransferEvents[0]?.args?.value;

    expect(after.ethCapital).to.be.equal(before.ethCapital.add(ethIn)); // ETH goes into capital pool
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived)); // NXM out is minted
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn)); // member sends ETH
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmTransferAmount)); // member receives NXM
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra, p1, tc, tk } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minEthOut = parseEther('0.0152');
    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    const { timestamp } = await ethers.provider.getBlock('latest');
    const deadline = timestamp + 5 * 60; // add 5 minutes

    await setNextBlockBaseFee(0);
    await ra.connect(member).swap(nxmIn, minEthOut, deadline, { maxPriorityFeePerGas: 0 });

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);
    const ethReceived = after.ethBalance.sub(before.ethBalance);
    const payoutFilter = p1.filters.Payout(member.address);
    const [ethPayoutEvent] = await p1.queryFilter(payoutFilter, -1);
    const ethPayoutAmount = ethPayoutEvent?.args?.amount;

    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn)); // nxmIn is burned
    expect(after.ethCapital).to.be.equal(before.ethCapital.sub(ethReceived)); // ETH goes out of capital pool
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn)); // member sends NXM
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethPayoutAmount)); // member receives ETH
  });
});
