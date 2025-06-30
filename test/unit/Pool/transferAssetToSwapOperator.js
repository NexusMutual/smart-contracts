const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { ethers } = require('hardhat');
const { parseEther } = require('ethers');

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

  it.skip('reverts if there is a asset in SwapOperator already', async function () {
    const fixture = await loadFixture(setup);
    const { pool } = fixture;

    await expect(pool.setAssetDetails(0, true, false)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('transfer eth to SwapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator } = fixture;
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
    const amount = parseEther('1');

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await setBalance(swapOperator.target, amount);
    await setBalance(pool.target, parseEther('1000'));

    await pool.connect(swapOperatorSigner).transferAssetToSwapOperator(ETH, amount);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.assetAddress).to.equal(ETH);
    expect(assetInSwapOperator.amount).to.equal(amount);
  });

  it('transfer usdc to SwapOperator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, swapOperator, usdc } = fixture;
    const amount = parseEther('1');

    await impersonateAccount(swapOperator.target);
    const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
    await setBalance(swapOperator.target, amount);
    usdc.mint(pool.target, amount);

    await pool.connect(swapOperatorSigner).transferAssetToSwapOperator(usdc, amount);

    const assetInSwapOperator = await pool.assetInSwapOperator();
    expect(assetInSwapOperator.assetAddress).to.equal(usdc.target);
    expect(assetInSwapOperator.amount).to.equal(amount);
  });
});
