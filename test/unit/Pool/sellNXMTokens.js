const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const { Role } = require('../utils').constants;
const { calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;
const { members: [memberOne] } = require('../utils').accounts;

describe('sellNXMTokens', function () {

  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool, poolData, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, Date.now());
    await pool.sendTransaction({ value: initialAssetValue });

    const member = memberOne;

    const buyValue = percentageBN(mcrEth, 1);
    await pool.buyNXM('1', { from: member, value: buyValue });
    const tokensToSell = await token.balanceOf(member);

    const expectedEthValue = await pool.getWei(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, { from: member });
    const balancePreSell = await web3.eth.getBalance(member);
    const nxmBalancePreSell = await token.balanceOf(member);

    const sellTx = await pool.sellNXMTokens(tokensToSell, { from: member, gasPrice: 0 });
    const nxmBalancePostSell = await token.balanceOf(member);
    const balancePostSell = await web3.eth.getBalance(member);

    const nxmBalanceDecrease = nxmBalancePreSell.sub(nxmBalancePostSell);
    assert(nxmBalanceDecrease.toString(), tokensToSell.toString());

    const ethOut = new BN(balancePostSell).sub(new BN(balancePreSell));
    assert(ethOut.toString(), expectedEthValue.toString());

    await expectEvent(sellTx, 'NXMSold', {
      member,
      nxmIn: tokensToSell.toString(),
      ethOut: expectedEthValue.toString(),
    });
  });
});
