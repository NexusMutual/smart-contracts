const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('./setup');
const { parseEther } = ethers.utils;

describe('buyNXM', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts on purchase with msg.value = 0', async function () {
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    await expect(pool.connect(member).buyNXM('1')).to.be.revertedWith('Pool: ethIn > 0');
  });

  it('reverts on purchase higher than of 5% ETH of mcrEth', async function () {
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;
    const buyValue = mcrEth.div(20).add(parseEther('1000'));

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    await expect(pool.connect(member).buyNXM('1', { value: buyValue })).to.be.revertedWith(
      'Pool: Purchases worth higher than 5% of MCReth are not allowed',
    );
  });

  it('reverts on purchase where the bought tokens are below min expected out token amount', async function () {
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;
    const buyValue = parseEther('1000');

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    const preEstimatedTokenBuyValue = await pool.getNXMForEth(buyValue);
    await expect(pool.connect(member).buyNXM(preEstimatedTokenBuyValue.add(1), { value: buyValue })).to.be.revertedWith(
      'Pool: tokensOut is less than minTokensOut',
    );
  });

  it('reverts on purchase if current MCR% exceeds 400%', async function () {
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth.mul(4).add(parseEther('100'));
    const buyValue = mcrEth.div(20).add(parseEther('1000'));

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    await expect(pool.connect(member).buyNXM('1', { value: buyValue })).to.be.revertedWith(
      'Pool: Cannot purchase if MCR% > 400%',
    );
  });

  it('reverts when MCReth is 0', async function () {
    const { pool, mcr } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('0');
    const initialAssetValue = parseEther('160000');
    const buyValue = mcrEth.div(20);

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    await expect(pool.connect(member).buyNXM('1', { value: buyValue })).to.be.revertedWith('Pool: ethIn > 0');
  });

  it('mints expected number of tokens for 5% of MCReth for mcrEth = 160k and MCR% = 150%', async function () {
    const { pool, mcr, token } = fixture;
    const [member] = fixture.accounts.members;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth.mul(150).div(100);
    const buyValue = mcrEth.div(20);

    await mcr.setMCR(mcrEth);
    await member.sendTransaction({ to: pool.address, value: initialAssetValue });

    const expectedTokensReceived = await pool.calculateNXMForEth(buyValue, initialAssetValue, mcrEth);

    const preBuyBalance = await token.balanceOf(member.address);

    await expect(pool.connect(member).buyNXM('0', { value: buyValue }))
      .to.emit(pool, 'NXMBought')
      .withArgs(
        member.address, // member
        buyValue, // ethIn
        expectedTokensReceived, // nxmOut
      );
    const postBuyBalance = await token.balanceOf(member.address);
    const tokensReceived = postBuyBalance.sub(preBuyBalance);

    expect(tokensReceived).to.be.equal(expectedTokensReceived);
  });
});
