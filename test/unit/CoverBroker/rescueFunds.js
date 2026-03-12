const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const { setup } = require('./setup');

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const { parseEther } = ethers;

describe('rescueFunds', function () {
  it('should rescue funds (ETH) to owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverBroker },
      coverBrokerOwner,
    } = fixture;

    await setBalance(coverBroker.target, parseEther('1'));
    const brokerBalanceBefore = await ethers.provider.getBalance(coverBroker.target);
    const ownerBalanceBefore = await ethers.provider.getBalance(coverBrokerOwner.address);

    const tx = await coverBroker.connect(coverBrokerOwner).rescueFunds(ETH);
    const receipt = await tx.wait();
    const txFee = receipt.gasUsed * receipt.gasPrice;

    const brokerBalanceAfter = await ethers.provider.getBalance(coverBroker.target);
    const ownerBalanceAfter = await ethers.provider.getBalance(coverBrokerOwner.address);

    expect(brokerBalanceBefore).not.to.equal(0);
    expect(brokerBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + brokerBalanceBefore - txFee);
  });

  it('should rescue funds (nonETH) to owner', async function () {
    const fixture = await loadFixture(setup);
    const {
      contracts: { coverBroker, dai },
      coverBrokerOwner,
    } = fixture;

    await dai.mint(coverBroker.target, parseEther('100'));
    const brokerBalanceBefore = await dai.balanceOf(coverBroker.target);
    const ownerBalanceBefore = await dai.balanceOf(coverBrokerOwner.address);

    await coverBroker.connect(coverBrokerOwner).rescueFunds(dai.target);

    const brokerBalanceAfter = await dai.balanceOf(coverBroker.target);
    const ownerBalanceAfter = await dai.balanceOf(coverBrokerOwner.address);

    expect(brokerBalanceBefore).not.to.equal(0);
    expect(brokerBalanceAfter).to.equal(0);
    expect(ownerBalanceAfter).to.equal(ownerBalanceBefore + brokerBalanceBefore);
  });

  it('should fail to rescue funds if the caller is not the owner', async function () {
    const fixture = await loadFixture(setup);
    const { coverBroker } = fixture.contracts;
    const nonOwner = ethers.Wallet.createRandom().connect(ethers.provider);
    await setBalance(nonOwner.address, parseEther('1000000'));

    await setBalance(coverBroker.target, parseEther('1'));
    const balanceBefore = await ethers.provider.getBalance(coverBroker.target);

    await expect(coverBroker.connect(nonOwner).rescueFunds(ETH)).to.revertedWith('Ownable: caller is not the owner');
    const balanceAfter = await ethers.provider.getBalance(coverBroker.target);
    expect(balanceAfter).to.equal(balanceBefore);
  });
});
