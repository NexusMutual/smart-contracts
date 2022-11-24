const { ether, expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const { web3 } = require('hardhat');
const { assert } = require('chai');
const { BN } = web3.utils;
const { Role } = require('../utils').constants;
const { setNextBlockBaseFee } = require('../utils').evm;
const { percentageBN } = require('../utils').tokenPrice;
const [memberOne] = require('../utils').accounts.members;

const P1MockMember = artifacts.require('P1MockMember');

describe('sellNXM', function () {
  it('reverts on sell that decreases the MCR% below 100%', async function () {
    const { pool, mcr, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const tokenAmountToSell = ether('1000');
    await token.mint(memberOne, tokenAmountToSell);

    await expectRevert(pool.sellNXM(tokenAmountToSell, '0', { from: memberOne }), 'MCR% cannot fall below 100%');
  });

  it('reverts on sell worth more than 5% of MCReth', async function () {
    const { pool, mcr, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const buyValue = percentageBN(mcrEth, 5);
    await pool.buyNXM('1', { from: memberOne, value: buyValue });
    await pool.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(
      pool.sellNXM(entireBalance, '0', { from: memberOne }),
      'Sales worth more than 5% of MCReth are not allowed',
    );
  });

  it('reverts on sell that exceeds member balance', async function () {
    const { pool, mcr, token } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const buyValue = percentageBN(mcrEth, 5);
    await pool.buyNXM('1', { from: memberOne, value: buyValue });

    const entireBalance = await token.balanceOf(memberOne);
    await expectRevert(pool.sellNXM(entireBalance.addn(1), '0', { from: memberOne }), 'Not enough balance');
  });

  it('reverts on sell from member that is a contract whose fallback function reverts', async function () {
    const { pool, mcr, token, tokenController, memberRoles } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const contractMember = await P1MockMember.new(pool.address, token.address, tokenController.address);
    await memberRoles.setRole(contractMember.address, Role.Member);

    const tokensToSell = ether('1');
    await token.mint(contractMember.address, tokensToSell);

    await expectRevert(contractMember.sellNXM(tokensToSell), 'Pool: Sell transfer failed');
  });

  it('reverts on sell from member when ethOut < minEthOut', async function () {
    const { pool, mcr, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = percentageBN(mcrEth, 150);

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const member = memberOne;

    const tokensToSell = ether('1');
    await token.mint(member, tokensToSell);

    const expectedEthValue = await pool.getEthForNXM(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, {
      from: member,
    });
    await expectRevert(
      pool.sellNXM(tokensToSell, expectedEthValue.add(new BN(1)), { from: member }),
      'Pool: ethOut < minEthOut',
    );
  });

  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool, mcr, token, tokenController } = this;

    const mcrEth = ether('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await pool.sendTransaction({ value: initialAssetValue });

    const member = memberOne;

    const buyValue = percentageBN(mcrEth, 1);
    await pool.buyNXM('1', { from: member, value: buyValue });
    const tokensToSell = await token.balanceOf(member);

    const expectedEthValue = await pool.getEthForNXM(tokensToSell);

    await token.approve(tokenController.address, tokensToSell, { from: member });
    const balancePreSell = await web3.eth.getBalance(member);
    const nxmBalancePreSell = await token.balanceOf(member);

    await setNextBlockBaseFee('0');
    const sellTx = await pool.sellNXM(tokensToSell, expectedEthValue, { from: member, gasPrice: 0 });
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
