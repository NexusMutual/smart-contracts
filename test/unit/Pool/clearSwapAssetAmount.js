const { ethers, network } = require('hardhat');
const { expect } = require('chai');
const { loadFixture, impersonateAccount, setBalance } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther, ZeroAddress } = require('ethers');

async function clearSwapAssetAmountSetup() {
  const fixture = await loadFixture(setup);
  const { swapOperator } = fixture;

  await impersonateAccount(swapOperator.target);
  const swapOperatorSigner = await ethers.getSigner(swapOperator.target);
  await setBalance(await swapOperatorSigner.getAddress(), ethers.parseEther('100'));

  return {
    ...fixture,
    swapOperatorSigner,
  };
}

describe('clearSwapAssetAmount', function () {
  it('reverts when not called swap operator', async function () {
    const fixture = await loadFixture(setup);
    const { pool, usdc } = fixture;

    await expect(pool.clearSwapAssetAmount(usdc)).to.be.revertedWithCustomError(pool, 'Unauthorized');
  });

  it('reverts when there is a global pause', async function () {
    const fixture = await loadFixture(clearSwapAssetAmountSetup);
    const { pool, registry, usdc, swapOperatorSigner } = fixture;
    await registry.setPauseConfig(1);

    await expect(pool.connect(swapOperatorSigner).clearSwapAssetAmount(usdc)).to.be.revertedWithCustomError(
      pool,
      'Paused',
    );
  });

  it('reverts when invalid asset id is passed', async function () {
    const fixture = await loadFixture(clearSwapAssetAmountSetup);
    const { pool, swapOperatorSigner } = fixture;
    const token = await ethers.deployContract('ERC20Mock');

    await expect(pool.connect(swapOperatorSigner).clearSwapAssetAmount(token.target)).to.be.revertedWithCustomError(
      pool,
      'InvalidAssetId',
    );
  });

  it('reverts when there are no assets in swap operator', async function () {
    const fixture = await loadFixture(clearSwapAssetAmountSetup);
    const { pool, swapOperatorSigner, usdc } = fixture;

    const packed = ethers.solidityPacked(['uint96', 'address'], [0, usdc.target]);

    await network.provider.send('hardhat_setStorageAt', [
      pool.target,
      '0x2', // slot index
      packed,
    ]);

    await expect(pool.connect(swapOperatorSigner).clearSwapAssetAmount(usdc.target)).to.be.revertedWithCustomError(
      pool,
      'NoSwapAssetAmountFound',
    );
  });

  it('should clear swap asset amount ', async function () {
    const fixture = await loadFixture(clearSwapAssetAmountSetup);
    const { pool, swapOperatorSigner, usdc } = fixture;

    const storedAmount = parseEther('1');
    const storedAsset = usdc.target;
    const packed = ethers.solidityPacked(['uint96', 'address'], [storedAmount, storedAsset]);

    await network.provider.send('hardhat_setStorageAt', [
      pool.target,
      '0x2', // slot index
      packed,
    ]);

    const stored = await pool.assetInSwapOperator();
    expect(stored.amount).to.equal(storedAmount);
    expect(stored.assetAddress).to.equal(storedAsset);

    await pool.connect(swapOperatorSigner).clearSwapAssetAmount(usdc);

    const { assetAddress, amount } = await pool.assetInSwapOperator();
    expect(amount).to.equal(0n);
    expect(assetAddress).to.equal(ZeroAddress);
  });
});
