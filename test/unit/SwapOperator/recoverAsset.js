const { ethers } = require('hardhat');
const {
  utils: { parseEther },
} = ethers;

describe('recoverAsset', function () {
  it('recovers enzyme vault shares', async function () {
    const { swapOperator, enzymeV4Vault, pool } = this.contracts;

    const [governance] = this.accounts.governanceAccounts;
    const [receiver] = this.accounts.nonMembers;

    await pool.connect(governance).addAsset(
      enzymeV4Vault.address,
      18, // decimals
      parseEther('100'), // asset minimum
      parseEther('1000'), // asset maximum
      '100', // 1% max slippage
      false, // isCoverAsset
    );

    const amountInPool = parseEther('2000');
    await enzymeV4Vault.mint(pool.address, amountInPool);

    const amountInSwapOperator = parseEther('10');
    await enzymeV4Vault.mint(swapOperator.address, amountInSwapOperator);

    await swapOperator.recoverAsset(enzymeV4Vault.address, receiver.address);

    const balanceAfter = await enzymeV4Vault.balanceOf(pool.address);

    assert.equal(balanceAfter.sub(amountInPool).toString(), amountInSwapOperator);
  });

  it('recovers arbitrary unknown asset', async function () {
    const { swapOperator } = this.contracts;

    const [receiver] = this.accounts.nonMembers;

    const ERC20Mock = await ethers.getContractFactory('ERC20Mock');
    const arbitraryAsset = await ERC20Mock.deploy();

    const amountInSwapOperator = parseEther('10');
    await arbitraryAsset.mint(swapOperator.address, amountInSwapOperator);

    await swapOperator.recoverAsset(arbitraryAsset.address, receiver.address);

    const balanceAfter = await arbitraryAsset.balanceOf(receiver.address);

    assert.equal(balanceAfter.toString(), amountInSwapOperator.toString());
  });
});
