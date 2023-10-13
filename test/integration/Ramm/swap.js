const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { setNextBlockBaseFee, setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers.utils;

async function getCapitalSupplyAndBalances(p1, tc, tk, memberAddress) {
  const ethCapital = await p1.getPoolValueInEth();
  const nxmSupply = await tc.totalSupply();
  const ethBalance = await ethers.provider.getBalance(memberAddress);
  const nxmBalance = await tk.balanceOf(memberAddress);
  return {
    ethCapital,
    nxmSupply,
    ethBalance,
    nxmBalance,
  };
}

async function swapSetup() {
  const fixture = await loadFixture(setup);
  const { tk, p1, tc } = fixture.contracts;
  const [member1] = fixture.accounts.members;

  const operator = await tk.operator();
  await setEtherBalance(operator, parseEther('10000'));
  await setEtherBalance(member1.address, parseEther('10000'));

  await tk.connect(await ethers.getImpersonatedSigner(operator)).mint(member1.address, parseEther('1000000000000'));
  await tk.connect(member1).approve(tc.address, parseEther('10000'));

  await setEtherBalance(p1.address, parseEther('145000'));

  return fixture;
}

describe('swap', function () {
  it('should revert if both NXM and ETH values are 0', async function () {
    const fixture = await loadFixture(swapSetup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    await expect(ra.connect(member).swap(0, 0, { value: 0 })).to.be.revertedWith('ONE_INPUT_REQUIRED');
  });

  it('should revert if both NXM and ETH values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const ethIn = parseEther('1');

    await expect(ra.connect(member).swap(nxmIn, 0, { value: ethIn })).to.be.revertedWith('ONE_INPUT_ONLY');
  });

  it('should revert if nxmOut < minTokensOut when swapping ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minTokensOut = parseEther('29'); // 1ETH = 28.8NXM at 0.0347ETH

    await expect(ra.connect(member).swap(0, minTokensOut, { value: ethIn })).to.be.revertedWith(
      'Ramm: nxmOut is less than minTokensOut',
    );
  });

  it('should revert if ethOut < minTokensOut when swapping NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    const minTokensOut = parseEther('0.016'); // 0.0152 ETH initial spot price

    await expect(ra.connect(member).swap(nxmIn, minTokensOut)).to.be.revertedWith(
      'Ramm: ethOut is less than minTokensOut',
    );
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ra, p1, tc, tk } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const nxmIn = parseEther('1');
    // TODO: why the low price?? is it because 15000010000 NXM supply / 110000 capital only hence low price
    const minEthOut = parseEther('0.000007');

    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    await setNextBlockBaseFee(0);
    const tx = await ra.connect(member).swap(nxmIn, minEthOut, { maxPriorityFeePerGas: 0 });
    await tx.wait();

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    // compare before / after states
    expect(before.nxmSupply).to.be.greaterThan(after.nxmSupply); // nxmIn is burned
    expect(before.ethCapital).to.be.greaterThan(after.ethCapital); // ETH goes out of capital pool
    expect(before.nxmBalance).to.be.greaterThan(after.nxmBalance); // user NXM goes in
    expect(before.ethBalance).to.be.lessThan(after.ethBalance); // user receives ETH

    const ethReceived = after.ethBalance.sub(before.ethBalance);
    const [ethPayOutEvent] = await p1.queryFilter(p1.filters.Payout(member.address), -1);
    const ethPayOutAmount = ethPayOutEvent.args.amount;

    // ensure after states are correct
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.sub(nxmIn));
    expect(after.ethCapital).to.be.equal(before.ethCapital.sub(ethReceived));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.sub(nxmIn));
    expect(after.ethBalance).to.be.equal(before.ethBalance.add(ethPayOutAmount));
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ra, tk, p1, tc } = fixture.contracts;
    const [member] = fixture.accounts.members;

    const ethIn = parseEther('1');
    const minNxmOut = parseEther('28.5');

    const before = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    await setNextBlockBaseFee(0);
    const tx = await ra.connect(member).swap(0, minNxmOut, { value: ethIn, maxPriorityFeePerGas: 0 });
    await tx.wait();

    const after = await getCapitalSupplyAndBalances(p1, tc, tk, member.address);

    // compare before / after states
    expect(before.ethCapital).to.be.lessThan(after.ethCapital); // ETH goes into capital pool
    expect(before.nxmSupply).to.be.lessThan(after.nxmSupply); // NXM out is minted
    expect(before.ethBalance).to.be.greaterThan(after.ethBalance); // user ETH goes in
    expect(before.nxmBalance).to.be.lessThan(after.nxmBalance); // user receives NXM

    const nxmReceived = after.nxmBalance.sub(before.nxmBalance);
    const nxmTransferEvents = await tk.queryFilter(tk.filters.Transfer(null, member.address), -1);
    const nxmTransferAmount = nxmTransferEvents[1].args.value;

    // ensure after states are correct
    expect(after.ethCapital).to.be.equal(before.ethCapital.add(ethIn));
    expect(after.nxmSupply).to.be.equal(before.nxmSupply.add(nxmReceived));
    expect(after.ethBalance).to.be.equal(before.ethBalance.sub(ethIn));
    expect(after.nxmBalance).to.be.equal(before.nxmBalance.add(nxmTransferAmount));
  });
});
