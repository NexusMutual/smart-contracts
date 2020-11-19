const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const { accounts } = require('../utils');
const { Role } = require('../utils').constants;
const { calculateMCRRatio, percentageBN } = require('../utils').tokenPrice;

const P1MockMember = artifacts.require('P1MockMember');

const {
  nonMembers: [fundSource],
  members: [memberOne],
} = accounts;

describe('sellNXM', function () {

  it('reverts on sell that decreases the MCR% below 100%', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const tokenAmountToSell = ether('1000');
    await token.mint(memberOne, tokenAmountToSell);

    await expectRevert(
      pool1.sellNXM(tokenAmountToSell, '0', { from: memberOne }),
      `MCR% cannot fall below 100%`,
    );
  });

  it('reverts on sell worth more than 5% of MCReth', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const buyValue = percentageBN(mcrEth, 5);
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance, '0', { from: memberOne }),
      `Sales worth more than 5% of MCReth are not allowed`,
    );
  });

  it('reverts on sell that exceeds member balance', async function () {
    const { pool1, poolData, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const buyValue = percentageBN(mcrEth, 5);
    await pool1.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool1.sellNXM(entireBalance.addn(1), '0', { from: memberOne }),
      `Not enough balance`,
    );
  });

  it('reverts on sell from member that is a contract whose fallback function reverts', async function () {
    const { pool1, poolData, token, master, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);

    const contractMember = await P1MockMember.new(pool1.address, token.address, tokenController.address);
    await master.enrollMember(contractMember.address, Role.Member);

    const tokensToSell = ether('1');
    await token.mint(contractMember.address, tokensToSell);

    await expectRevert(
      contractMember.sellNXM(tokensToSell),
      'Pool: Sell transfer failed',
    );
  });

  it('reverts on sell from member when ethOut < minEthOut', async function () {
    const { pool1, poolData, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);
    const member = memberOne;

    const tokensToSell = ether('1');
    await token.mint(member, tokensToSell);

    const expectedEthValue = await pool1.getEthForNXM(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, {
      from: member,
    });
    await expectRevert(
      pool1.sellNXM(tokensToSell, expectedEthValue.add(new BN(1)), {
        from: member,
      }),
      'Pool: ethOut < minEthOut',
    );
  });

  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool1, poolData, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    const mcrRatio = calculateMCRRatio(initialAssetValue, mcrEth);
    await pool1.sendTransaction({
      from: fundSource,
      value: initialAssetValue,
    });
    const date = new Date().getTime();
    await poolData.setLastMCR(mcrRatio, mcrEth, initialAssetValue, date);
    const member = memberOne;

    const buyValue = percentageBN(mcrEth, 1);
    await pool1.buyNXM('1', { from: member, value: buyValue });
    const tokensToSell = await token.balanceOf(member);

    const expectedEthValue = await pool1.getEthForNXM(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, {
      from: member,
    });
    const balancePreSell = await web3.eth.getBalance(member);
    const nxmBalancePreSell = await token.balanceOf(member);
    const sellTx = await pool1.sellNXM(tokensToSell, expectedEthValue, {
      from: member,
    });
    const nxmBalancePostSell = await token.balanceOf(member);
    const balancePostSell = await web3.eth.getBalance(member);

    const nxmBalanceDecrease = nxmBalancePreSell.sub(nxmBalancePostSell);
    assert(nxmBalanceDecrease.toString(), tokensToSell.toString());

    const { gasPrice } = await web3.eth.getTransaction(sellTx.receipt.transactionHash);
    const ethSpentOnGas = new BN(sellTx.receipt.gasUsed).mul(new BN(gasPrice));
    const ethOut = new BN(balancePostSell).sub(new BN(balancePreSell)).add(ethSpentOnGas);
    assert(ethOut.toString(), expectedEthValue.toString());

    await expectEvent(sellTx, 'NXMSold', {
      member,
      nxmIn: tokensToSell.toString(),
      ethOut: expectedEthValue.toString(),
    });
  });
});
