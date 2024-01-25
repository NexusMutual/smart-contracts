const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('./setup');
const { setEtherBalance } = require('../../utils/evm');

const { parseEther } = ethers.utils;
const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

async function requestAssetSetup() {
  const fixture = await loadFixture(setup);
  const amount = parseEther('1000');

  const { dai, pool } = fixture.contracts;

  await dai.mint(pool.address, amount);
  await setEtherBalance(pool.address, amount);
  return fixture;
}

describe('requestAsset', function () {
  it('revert if the requested asset is not allowed', async function () {
    const {
      contracts: { swapOperator, weth },
    } = await loadFixture(requestAssetSetup);
    const [safe] = await ethers.getSigners();

    await expect(swapOperator.connect(safe).requestAsset(weth.address, parseEther('1'))).to.be.revertedWith(
      'SwapOp: asset not allowed',
    );
  });

  it('revert if the requested amount surpasses the limit', async function () {
    const {
      contracts: { swapOperator },
    } = await loadFixture(requestAssetSetup);
    const [safe] = await ethers.getSigners();
    const amount = parseEther('7000');

    await expect(swapOperator.connect(safe).requestAsset(ETH_ADDRESS, amount)).to.be.revertedWith(
      'SwapOp: tokenBalanceAfter > min',
    );
  });

  it('should store the request if asset is ETH', async function () {
    const {
      contracts: { swapOperator },
    } = await loadFixture(requestAssetSetup);
    const [safe] = await ethers.getSigners();
    const amount = parseEther('1');

    await swapOperator.connect(safe).requestAsset(ETH_ADDRESS, amount);

    const request = await swapOperator.transferRequest();
    expect(request.asset).to.equal(ETH_ADDRESS);
    expect(request.amount).to.equal(amount);
  });

  it('should store the request if asset is DAI', async function () {
    const {
      contracts: { swapOperator, dai },
    } = await loadFixture(requestAssetSetup);
    const [safe] = await ethers.getSigners();
    const amount = parseEther('1');

    await swapOperator.connect(safe).requestAsset(dai.address, amount);

    const request = await swapOperator.transferRequest();
    expect(request.asset).to.equal(dai.address);
    expect(request.amount).to.equal(amount);
  });
});
