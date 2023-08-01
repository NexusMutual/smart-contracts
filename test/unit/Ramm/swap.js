const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const { setup } = require('./setup');
const { setNextBlockTime } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const { BigNumber } = ethers;

describe('swap', function () {
  it('should revert if passed values are 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await expect(ramm.connect(member).swap(0)).to.be.revertedWith('ONE_INPUT_REQUIRED');
  });
  it('should revert if passed values are greater then 0', async function () {
    const fixture = await loadFixture(setup);
    const { ramm } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    await expect(ramm.connect(member).swap(parseEther('1'), { value: parseEther('1') })).to.be.revertedWith(
      'ONE_INPUT_ONLY',
    );
  });

  it('should swap NXM for ETH', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, tokenController } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const liquidity = BigNumber.from('2050000000000000000000');
    const newNXM = BigNumber.from('200688905003625815808560');
    const amount = parseEther('1');

    const ethOut = liquidity.sub(liquidity.mul(newNXM).div(newNXM.add(amount)));

    const timestamp = await ramm.lastSwapTimestamp();
    await nxm.connect(member).approve(tokenController.address, amount);

    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    await setNextBlockTime(timestamp.add(6 * 60 * 60).toNumber());
    const tx = await ramm.connect(member).swap(amount);
    const { effectiveGasPrice, cumulativeGasUsed } = await tx.wait();

    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);

    expect(nxmBalanceBefore).to.be.equal(nxmBalanceAfter.add(amount));
    expect(ethBalanceBefore).to.be.equal(ethBalanceAfter.sub(ethOut).add(effectiveGasPrice.mul(cumulativeGasUsed)));
  });

  it('should swap ETH for NXM', async function () {
    const fixture = await loadFixture(setup);
    const { ramm, nxm, tokenController } = fixture.contracts;
    const {
      members: [member],
    } = fixture.accounts;

    const amount = parseEther('1');
    const liquidity = BigNumber.from('2050000000000000000000');
    const newNXM = BigNumber.from('68826162646107933349888');

    const nxmOut = newNXM.sub(liquidity.mul(newNXM).div(liquidity.add(amount)));

    const nxmBalanceBefore = await nxm.balanceOf(member.address);
    const totalSupplyBefore = await tokenController.totalSupply();
    const ethBalanceBefore = await ethers.provider.getBalance(member.address);

    const timestamp = await ramm.lastSwapTimestamp();
    await setNextBlockTime(timestamp.add(6 * 60 * 60).toNumber());

    const tx = await ramm.connect(member).swap(0, { value: amount });

    const { effectiveGasPrice, cumulativeGasUsed } = await tx.wait();

    const nxmBalanceAfter = await nxm.balanceOf(member.address);
    const totalSupplyAfter = await tokenController.totalSupply();
    const ethBalanceAfter = await ethers.provider.getBalance(member.address);

    expect(ethBalanceBefore).to.be.equal(ethBalanceAfter.add(amount).add(effectiveGasPrice.mul(cumulativeGasUsed)));
    expect(nxmBalanceAfter).to.be.equal(nxmBalanceBefore.add(nxmOut));
    expect(totalSupplyAfter).to.be.equal(totalSupplyBefore.add(nxmOut));
  });
});
