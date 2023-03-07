const { ethers } = require('hardhat');
const { expect } = require('chai');
const { calculateFirstTrancheId } = require('../utils/staking');
const base64 = require('base64-js');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { daysToSeconds } = require('../../../lib/helpers');

const { parseEther, formatEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const svgHeader = 'data:image/svg+xml;base64,';
const jsonHeader = 'data:application/json;base64,';
describe('StakingNFTDescriptor', function () {
  before(async function () {
    const {
      members: [staker],
    } = this.accounts;
    const { stakingPool1 } = this.contracts;
    const stakingAmount = parseEther('17.091');
    const block = await ethers.provider.getBlock('latest');
    const firstTrancheId = calculateFirstTrancheId(block, 30, 0);

    await stakingPool1.connect(staker).depositTo(
      stakingAmount,
      firstTrancheId,
      0, // new position
      AddressZero,
    );

    await stakingPool1.connect(staker).depositTo(
      stakingAmount,
      firstTrancheId,
      0, // new position
      AddressZero,
    );

    await stakingPool1.connect(staker).depositTo(
      stakingAmount,
      firstTrancheId + 2,
      1, // edit
      AddressZero,
    );
    this.stakingAmount = stakingAmount;
  });

  it('tokenURI json output should be formatted properly', async function () {
    const { stakingNFT } = this.contracts;
    const uri = await stakingNFT.tokenURI(1);

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const expectedDepositAmount = formatEther(this.stakingAmount.toString());
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain(Number(expectedDepositAmount).toFixed(2));

    // 2x deposits
    const expectedAmount = formatEther(this.stakingAmount.mul(2).toString());
    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    expect(decodedSvg).to.contain('1' /* tokenId */);
    expect(decodedSvg).to.contain(Number(expectedAmount).toFixed(2));
  });

  it('tokenURI with single deposit should be formatted properly', async function () {
    const { stakingNFT } = this.contracts;
    const uri = await stakingNFT.tokenURI(2);

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const expectedDepositAmount = formatEther(this.stakingAmount.toString());
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain(Number(expectedDepositAmount).toFixed(2));

    const expectedAmount = formatEther(this.stakingAmount.toString());
    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    expect(decodedSvg).to.contain('1' /* tokenId */);
    expect(decodedSvg).to.contain(Number(expectedAmount).toFixed(2));
  });

  it('should handle non existing token', async function () {
    const { stakingNFT } = this.contracts;

    const uri = await stakingNFT.tokenURI(10);

    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.description).to.be.equal('Token id 10 is not minted');
  });

  it('should handle expired tokens', async function () {
    const { stakingNFT } = this.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(timestamp + daysToSeconds(300));
    await mineNextBlock();

    const uri = await stakingNFT.tokenURI(1);

    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.description).to.contain('Deposit has expired');
  });
});
