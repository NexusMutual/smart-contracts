const { expect } = require('chai');
const {
  loadFixture,
  impersonateAccount,
  setBalance,
  setNextBlockBaseFeePerGas,
} = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ethers, nexus, network } = require('hardhat');
const { parseEther } = require('ethers');
const { ETH } = nexus.constants.Assets;

// TODO: missing tests when ETH transfers are rejected

describe('transferAssetToSwapOperator', function () {
  it('reverts if the caller is not SwapOperator contract', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;
    const amount = parseEther('1');

    await expect(pool.transferAssetToSwapOperator(usdc, amount)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('reverts if there is a global pause', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, registry, usdc } = fixture;

    const amount = parseEther('1');
    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await registry.setPauseConfig(1);
    await setBalance(swapOperator.target, amount);

    await expect(
      pool.connect(swapOperatorSigner).transferAssetToSwapOperator(usdc, amount),
    ).to.be.revertedWithCustomError(pool, 'Paused');
  });

  it('reverts if there is a asset in SwapOperator already', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc, swapOperator } = fixture;

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await setBalance(swapOperator.target, parseEther('1000'));
    await setBalance(pool.target, parseEther('1000'));

    const packed = ethers.solidityPacked(['uint96', 'address'], [parseEther('1'), usdc.target]);

    await network.provider.send('hardhat_setStorageAt', [
      pool.target,
      '0x2', // slot index
      packed,
    ]);

    await expect(
      pool.connect(swapOperatorSigner).transferAssetToSwapOperator(usdc, parseEther('1')),
    ).to.be.revertedWithCustomError(pool, 'OrderInProgress');
  });

  it('transfer eth to SwapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator } = fixture;
    const amount = parseEther('1');

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await setBalance(swapOperator.target, amount);
    await setBalance(pool.target, parseEther('1000'));

    const poolBalanceBefore = await ethers.provider.getBalance(pool.target);
    const swapOperatorBalanceBefore = await ethers.provider.getBalance(swapOperator.target);
    await setNextBlockBaseFeePerGas(0);
    await pool.connect(swapOperatorSigner).transferAssetToSwapOperator(
      ETH,
      amount,
      { maxPriorityFeePerGas: 0 }, // overrides
    );

    const poolBalanceAfter = await ethers.provider.getBalance(pool.target);
    const swapOperatorBalanceAfter = await ethers.provider.getBalance(swapOperator.target);
    const assetInSwapOperator = await pool.assetInSwapOperator();

    expect(assetInSwapOperator.assetAddress).to.equal(ETH);
    expect(assetInSwapOperator.amount).to.equal(amount);
    expect(poolBalanceAfter).to.equal(poolBalanceBefore - amount);
    expect(swapOperatorBalanceAfter).to.equal(swapOperatorBalanceBefore + amount);
  });

  it('transfer usdc to SwapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, usdc } = fixture;
    const amount = parseEther('1');

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await setBalance(swapOperator.target, amount);
    await usdc.mint(pool.target, amount);

    await pool.connect(swapOperatorSigner).transferAssetToSwapOperator(usdc, amount);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.assetAddress).to.equal(usdc.target);
    expect(assetInSwapOperator.amount).to.equal(amount);
  });
});
