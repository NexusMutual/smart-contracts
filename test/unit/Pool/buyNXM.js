const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;
const { BN } = web3.utils;

const { members: [member] } = require('../utils').accounts;

describe('buyNXM', function () {

  it('reverts on purchase with msg.value = 0', async function () {
    const { pool, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = new BN('0');

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    await expectRevert(
      pool.buyNXM('1', { from: member, value: buyValue }),
      'Pool: ethIn > 0',
    );
  });

  it('reverts on purchase higher than of 5% ETH of mcrEth', async function () {
    const { pool, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    await expectRevert(
      pool.buyNXM('1', { from: member, value: buyValue }),
      'Purchases worth higher than 5% of MCReth are not allowed',
    );
  });

  it('reverts on purchase where the bought tokens are below min expected out token amount', async function () {
    const { pool, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;
    const buyValue = ether('1000');

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const preEstimatedTokenBuyValue = await pool.getNXMForEth(buyValue);
    await expectRevert(
      pool.buyNXM(preEstimatedTokenBuyValue.add(new BN(1)), { from: member, value: buyValue }),
      'tokensOut is less than minTokensOut',
    );
  });

  it('reverts on purchase if current MCR% exceeds 400%', async function () {
    const { pool, mcr } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth.mul(new BN(4)).add(new BN(1e20.toString()));
    const buyValue = mcrEth.div(new BN(20)).add(ether('1000'));

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    await expectRevert(
      pool.buyNXM('1', { from: member, value: buyValue }),
      'Cannot purchase if MCR% > 400%',
    );
  });

  it('reverts when MCReth is 0', async function () {
    const { pool, mcr } = this;

    const mcrEth = ether('0');
    const initialAssetValue = ether('160000');
    const buyValue = mcrEth.div(new BN(20));

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    await expectRevert.unspecified(pool.buyNXM('1', { from: member, value: buyValue }));
  });

  it('mints expected number of tokens to member in exchange of 5% of MCReth for mcrEth = 160k and MCR% = 150%', async function () {
    const { pool, mcr, token } = this;
    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);
    const buyValue = mcrEth.div(new BN(20));

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const expectedTokensReceived = await pool.calculateNXMForEth(
      buyValue, initialAssetValue, mcrEth,
    );

    const preBuyBalance = await token.balanceOf(member);
    const tx = await pool.buyNXM('0', { from: member, value: buyValue });
    const postBuyBalance = await token.balanceOf(member);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    assert.equal(tokensReceived.toString(), expectedTokensReceived.toString());

    await expectEvent(tx, 'NXMBought', {
      member,
      ethIn: buyValue.toString(),
      nxmOut: expectedTokensReceived.toString(),
    });
  });
});
