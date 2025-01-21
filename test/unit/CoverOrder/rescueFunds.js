const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');
const { setEtherBalance } = require('../utils').evm;

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const { parseEther } = ethers.utils;

describe('rescueFunds', function () {
  it('should rescue funds (ETH) to owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverOrder },
      accounts: { coverOrderOwner },
    } = fixture;

    await setEtherBalance(coverOrder.address, parseEther('1'));
    const orderContractBalanceBefore = await ethers.provider.getBalance(coverOrder.address);
    const ownerBalanceBefore = await ethers.provider.getBalance(coverOrderOwner.address);

    const tx = await coverOrder.connect(coverOrderOwner).rescueFunds(ETH);
    const receipt = await tx.wait();

    const orderContractBalanceAfter = await ethers.provider.getBalance(coverOrder.address);
    const ownerBalanceAfter = await ethers.provider.getBalance(coverOrderOwner.address);

    expect(orderContractBalanceBefore).not.to.equal(0);
    expect(orderContractBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(
      ownerBalanceBefore.add(orderContractBalanceBefore).sub(receipt.effectiveGasPrice.mul(receipt.gasUsed)),
    );
  });

  it('should rescue funds (nonETH) to owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverOrder, dai },
      accounts: { coverOrderOwner },
    } = fixture;

    await dai.mint(coverOrder.address, parseEther('100'));
    const orderContractBalanceBefore = await dai.balanceOf(coverOrder.address);
    const ownerBalanceBefore = await dai.balanceOf(coverOrderOwner.address);

    await coverOrder.connect(coverOrderOwner).rescueFunds(dai.address);

    const orderContractBalanceAfter = await dai.balanceOf(coverOrder.address);
    const ownerBalanceAfter = await dai.balanceOf(coverOrderOwner.address);

    expect(orderContractBalanceBefore).not.to.equal(0);
    expect(orderContractBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(orderContractBalanceBefore));
  });

  it('should fail to rescue funds if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { coverOrder } = fixture.contracts;
    const { notOwner } = fixture.accounts;

    const balanceBefore = await ethers.provider.getBalance(coverOrder.address);

    await expect(coverOrder.connect(notOwner).rescueFunds(ETH)).to.revertedWithCustomError(
      coverOrder,
      'OnlyController',
    );
    const balanceAfter = await ethers.provider.getBalance(coverOrder.address);
    expect(balanceAfter).to.equal(balanceBefore);
  });
});
