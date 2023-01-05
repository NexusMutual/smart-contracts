const { ethers } = require('hardhat');
const { expect } = require('chai');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { setNextBlockBaseFee } = require('../utils').evm;
const { percentageBigNumber } = require('../utils').tokenPrice;

describe('sellNXMTokens', function () {
  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool, mcr, token, tokenController } = this;
    const {
      members: [member],
      nonMembers: [fundSource],
    } = this.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ value: initialAssetValue, to: pool.address });

    const buyValue = percentageBigNumber(mcrEth, 1);
    await pool.connect(member).buyNXM('1', { value: buyValue });
    const tokensToSell = await token.balanceOf(member.address);

    const expectedEthValue = await pool.getEthForNXM(tokensToSell);

    await token.connect(member).approve(tokenController.address, tokensToSell);
    const balancePreSell = await ethers.provider.getBalance(member.address);
    const nxmBalancePreSell = await token.balanceOf(member.address);

    await setNextBlockBaseFee('0');

    await expect(pool.connect(member).sellNXMTokens(tokensToSell, { gasPrice: 0 }))
      .to.emit(pool, 'NXMSold')
      .withArgs(member.address, tokensToSell, expectedEthValue);

    const nxmBalancePostSell = await token.balanceOf(member.address);
    const balancePostSell = await ethers.provider.getBalance(member.address);

    const nxmBalanceDecrease = nxmBalancePreSell.sub(nxmBalancePostSell);
    expect(nxmBalanceDecrease).to.equal(tokensToSell);

    const ethOut = BigNumber.from(balancePostSell).sub(BigNumber.from(balancePreSell));
    expect(ethOut).to.equal(expectedEthValue);
  });
});
