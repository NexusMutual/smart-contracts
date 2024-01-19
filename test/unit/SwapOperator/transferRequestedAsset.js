const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const { setEtherBalance } = require('../utils').evm;
const setup = require('./setup');

const { parseEther } = ethers.utils;
const { AddressZero } = ethers.constants;

async function transferRequestedAssetSetup() {
  const fixture = await loadFixture(setup);
  const {
    contracts: { swapOperator, pool },
    constants: { ETH_ADDRESS },
  } = fixture;
  const [safe] = await ethers.getSigners();
  const amount = parseEther('1');
  await setEtherBalance(pool.address, parseEther('1000'));

  await swapOperator.connect(safe).requestAsset(ETH_ADDRESS, amount);

  return { ...fixture, requestedAmount: amount, requestedAsset: ETH_ADDRESS };
}

describe('transferRequestedAsset', function () {
  it('transfers the requested amount', async function () {
    const {
      contracts: { swapOperator },
    } = await loadFixture(transferRequestedAssetSetup);
    const [controller] = await ethers.getSigners();

    await swapOperator.connect(controller).transferRequestedAsset();

    const request = await swapOperator.transferRequest();
    expect(request.asset).to.equal(AddressZero);
    expect(request.amount).to.equal(0);
  });

  it('emits TransferredToSafe event with asset address and amount', async function () {
    const fixture = await loadFixture(transferRequestedAssetSetup);
    const { swapOperator } = fixture.contracts;
    const { requestedAmount, requestedAsset } = fixture;
    const [controller] = await ethers.getSigners();

    await expect(swapOperator.connect(controller).transferRequestedAsset())
      .to.emit(swapOperator, 'TransferredToSafe')
      .withArgs(requestedAsset, requestedAmount);
  });

  it('revert if the requested amount is 0', async function () {
    const {
      contracts: { swapOperator },
    } = await loadFixture(setup);
    const [controller] = await ethers.getSigners();

    const request = await swapOperator.transferRequest();
    expect(request.amount).to.equal(0);

    await expect(swapOperator.connect(controller).transferRequestedAsset()).to.be.revertedWith(
      'SwapOp: request amount must be greater than 0',
    );
  });
});
