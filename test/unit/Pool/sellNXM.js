const { ethers } = require('hardhat');
const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

const setup = require('./setup');
const { BigNumber } = ethers;
const { parseEther } = ethers.utils;
const { Role } = require('../utils').constants;
const { setNextBlockBaseFee } = require('../utils').evm;
const { percentageBigNumber } = require('../utils').tokenPrice;

describe('sellNXM', function () {
  let fixture;
  beforeEach(async function () {
    fixture = await loadFixture(setup);
  });

  it('reverts on sell that decreases the MCR% below 100%', async function () {
    const { pool, mcr, token } = fixture;
    const {
      members: [memberOne],
      nonMembers: [fundSource],
    } = fixture.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const tokenAmountToSell = parseEther('1000');
    await token.mint(memberOne.address, tokenAmountToSell);

    await expect(pool.connect(memberOne).sellNXM(tokenAmountToSell, '0')).to.be.revertedWith(
      'Pool: MCR% cannot fall below 100%',
    );
  });

  it('reverts on sell worth more than 5% of MCReth', async function () {
    const { pool, mcr, token } = fixture;
    const {
      members: [memberOne],
      nonMembers: [fundSource],
    } = fixture.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const buyValue = percentageBigNumber(mcrEth, 5);
    await pool.connect(memberOne).buyNXM('1', { value: buyValue });
    await pool.connect(memberOne).buyNXM('1', { value: buyValue });

    const entireBalance = await token.balanceOf(memberOne.address);
    await expect(pool.connect(memberOne).sellNXM(entireBalance, '0')).to.be.revertedWith(
      'Pool: Sales worth more than 5% of MCReth are not allowed',
    );
  });

  it('reverts on sell that exceeds member balance', async function () {
    const { pool, mcr, token } = fixture;
    const {
      members: [memberOne],
      nonMembers: [fundSource],
    } = fixture.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const buyValue = percentageBigNumber(mcrEth, 5);
    await pool.connect(memberOne).buyNXM('1', { value: buyValue });

    const entireBalance = await token.balanceOf(memberOne.address);
    await expect(pool.connect(memberOne).sellNXM(entireBalance.add(1), '0')).to.be.revertedWith(
      'Pool: Not enough balance',
    );
  });

  it('reverts on sell from member that is a contract whose fallback function reverts', async function () {
    const { pool, mcr, token, tokenController, memberRoles } = fixture;
    const {
      nonMembers: [fundSource],
    } = fixture.accounts;
    const P1MockMember = await ethers.getContractFactory('P1MockMember');

    const mcrEth = parseEther('160000');
    const initialAssetValue = percentageBigNumber(mcrEth, 150);

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const contractMember = await P1MockMember.deploy(pool.address, token.address, tokenController.address);
    await memberRoles.setRole(contractMember.address, Role.Member);

    const tokensToSell = parseEther('1');
    await token.mint(contractMember.address, tokensToSell);

    await expect(contractMember.sellNXM(tokensToSell)).to.be.revertedWith('Pool: Sell transfer failed');
  });

  it('reverts on sell from member when ethOut < minEthOut', async function () {
    const { pool, mcr, token, tokenController } = fixture;
    const {
      members: [member],
      nonMembers: [fundSource],
    } = fixture.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = percentageBigNumber(mcrEth, 150);

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const tokensToSell = parseEther('1');
    await token.mint(member.address, tokensToSell);

    const expectedEthValue = await pool.getEthForNXM(tokensToSell);

    await token.connect(member).approve(tokenController.address, tokensToSell);
    await expect(
      pool.connect(member).sellNXM(tokensToSell, expectedEthValue.add(BigNumber.from(1))),
    ).to.be.revertedWith('Pool: ethOut < minEthOut');
  });

  it('burns tokens from member in exchange for ETH worth 1% of mcrEth', async function () {
    const { pool, mcr, token, tokenController } = fixture;
    const {
      members: [member],
      nonMembers: [fundSource],
    } = fixture.accounts;

    const mcrEth = parseEther('160000');
    const initialAssetValue = mcrEth;

    await mcr.setMCR(mcrEth);
    await fundSource.sendTransaction({ to: pool.address, value: initialAssetValue });

    const buyValue = percentageBigNumber(mcrEth, 1);
    await pool.connect(member).buyNXM('1', { value: buyValue });
    const tokensToSell = await token.balanceOf(member.address);

    const expectedEthValue = await pool.getEthForNXM(tokensToSell);

    await token.connect(member).approve(tokenController.address, tokensToSell);
    const balancePreSell = await ethers.provider.getBalance(member.address);
    const nxmBalancePreSell = await token.balanceOf(member.address);

    await setNextBlockBaseFee('0');

    await expect(pool.connect(member).sellNXM(tokensToSell, expectedEthValue, { gasPrice: 0 }))
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
