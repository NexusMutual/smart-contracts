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
      contracts: { coverBroker },
      coverBrokerOwner,
    } = fixture;

    await setEtherBalance(coverBroker.address, parseEther('1'));
    const brokerBalanceBefore = await ethers.provider.getBalance(coverBroker.address);
    const ownerBalanceBefore = await ethers.provider.getBalance(coverBrokerOwner.address);

    const tx = await coverBroker.connect(coverBrokerOwner).rescueFunds(ETH);
    const receipt = await tx.wait();

    const brokerBalanceAfter = await ethers.provider.getBalance(coverBroker.address);
    const ownerBalanceAfter = await ethers.provider.getBalance(coverBrokerOwner.address);

    expect(brokerBalanceBefore).not.to.equal(0);
    expect(brokerBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(
      ownerBalanceBefore.add(brokerBalanceBefore).sub(receipt.effectiveGasPrice.mul(receipt.gasUsed)),
    );
  });

  it('should rescue funds (nonETH) to owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverBroker, dai },
      coverBrokerOwner,
    } = fixture;

    await dai.mint(coverBroker.address, parseEther('100'));
    const brokerBalanceBefore = await dai.balanceOf(coverBroker.address);
    const ownerBalanceBefore = await dai.balanceOf(coverBrokerOwner.address);

    await coverBroker.connect(coverBrokerOwner).rescueFunds(dai.address);

    const brokerBalanceAfter = await dai.balanceOf(coverBroker.address);
    const ownerBalanceAfter = await dai.balanceOf(coverBrokerOwner.address);

    expect(brokerBalanceBefore).not.to.equal(0);
    expect(brokerBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore.add(brokerBalanceBefore));
  });

  it('should fail to rescue funds if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { coverBroker } = fixture.contracts;
    const nonOwner = await ethers.Wallet.createRandom().connect(ethers.provider);
    await setEtherBalance(nonOwner.address, parseEther('1000000'));

    const balanceBefore = await ethers.provider.getBalance(coverBroker.address);

    await expect(coverBroker.connect(nonOwner).rescueFunds(ETH)).to.revertedWith('Ownable: caller is not the owner');
    const balanceAfter = await ethers.provider.getBalance(coverBroker.address);
    expect(balanceAfter).to.equal(balanceBefore);
  });
});
