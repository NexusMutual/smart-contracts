const { ethers } = require('hardhat');
const { expect } = require('chai');
const { calculateFirstTrancheId } = require('../utils/staking');
const base64 = require('base64-js');
const { mineNextBlock, setNextBlockTime } = require('../../utils/evm');
const { daysToSeconds } = require('../../../lib/helpers');
const { ETH_ASSET_ID } = require('../utils/cover');
const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers');
const setup = require('../setup');
const { BigNumber } = ethers;
const { parseEther, formatEther } = ethers.utils;
const { AddressZero } = ethers.constants;

const svgHeader = 'data:image/svg+xml;base64,';
const jsonHeader = 'data:application/json;base64,';

async function stakingNFTDescriptorSetup() {
  const fixture = await loadFixture(setup);
  const {
    members: [staker, coverBuyer],
  } = fixture.accounts;
  const { stakingPool1, cover } = fixture.contracts;
  const stakingAmount = parseEther('170.091');
  const block = await ethers.provider.getBlock('latest');
  const firstTrancheId = calculateFirstTrancheId(block, 60, 30);

  await stakingPool1.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId,
    0, // new position
    AddressZero,
  );

  await stakingPool1.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId + 1,
    0, // new position
    AddressZero,
  );

  const amount = parseEther(Math.random().toPrecision(15));
  // buy eth cover (tokenId = 1)
  await cover.connect(coverBuyer).buyCover(
    {
      coverId: 0, // new cover
      owner: coverBuyer.address,
      productId: 0,
      coverAsset: ETH_ASSET_ID,
      amount,
      period: daysToSeconds(30),
      maxPremiumInAsset: amount,
      paymentAsset: ETH_ASSET_ID,
      payWitNXM: false,
      commissionRatio: parseEther('0'),
      commissionDestination: AddressZero,
      ipfsData: '',
    },
    [{ poolId: 1, coverAmountInAsset: amount.toString() }],
    {
      value: amount,
    },
  );

  await stakingPool1.connect(staker).depositTo(
    stakingAmount,
    firstTrancheId + 2,
    1, // edit
    AddressZero,
  );

  return {
    ...fixture,
    coverAmount: amount,
    stakingAmount,
  };
}

describe('StakingNFTDescriptor', function () {
  it('tokenURI json output should be formatted properly', async function () {
    const fixture = await loadFixture(stakingNFTDescriptorSetup);
    const { stakingNFT } = fixture.contracts;
    const uri = await stakingNFT.tokenURI(1);

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const expectedDepositAmount = formatEther(fixture.stakingAmount.toString());
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain(Number(expectedDepositAmount).toFixed(2));
    // TODO: check rewards

    // 2x deposits
    const expectedAmount = formatEther(fixture.stakingAmount.mul(2).toString());
    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    expect(decodedSvg).to.match(/<tspan>1<\/tspan>/);
    expect(decodedSvg).to.contain(Number(expectedAmount).toFixed(2));
  });

  it('tokenURI with single deposit should be formatted properly', async function () {
    const fixture = await loadFixture(stakingNFTDescriptorSetup);
    const { stakingNFT } = fixture.contracts;
    const uri = await stakingNFT.tokenURI(2);

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const expectedDepositAmount = formatEther(fixture.stakingAmount.toString());
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);
    expect(decodedJson.description).to.contain(Number(expectedDepositAmount).toFixed(2));

    const expectedAmount = formatEther(fixture.stakingAmount.toString());
    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    // token id is 2
    expect(decodedSvg).to.match(/<tspan>2<\/tspan>/);
    expect(decodedSvg).to.contain(Number(expectedAmount).toFixed(2));
  });

  it('should handle expired tokens', async function () {
    const fixture = await loadFixture(stakingNFTDescriptorSetup);
    const { stakingNFT } = fixture.contracts;

    const { timestamp } = await ethers.provider.getBlock('latest');
    await setNextBlockTime(timestamp + daysToSeconds(300));
    await mineNextBlock();

    const uri = await stakingNFT.tokenURI(1);

    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.description).to.contain('Deposit has expired');

    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    // poolId + tokenID
    expect(decodedSvg).to.match(/<tspan>1<\/tspan>/);
    expect(decodedSvg).to.match(/<tspan>0.00 NXM<\/tspan>/);
  });

  it('should parse random decimals properly', async function () {
    const fixture = await loadFixture(stakingNFTDescriptorSetup);
    const { stakingNFTDescriptor } = fixture.contracts;

    const promises = [];
    for (let i = 0; i < 100; i++) {
      const random = Math.random().toFixed(18);
      const randomWei = ethers.utils.parseEther(random.toString());

      const expected = formatEther(randomWei.toString());
      promises.push(
        stakingNFTDescriptor.toFloat(randomWei, 18).then(res => {
          expect(res).to.be.equal(expected.slice(0, 4));
        }),
      );
    }
    await Promise.all(promises);
  });
  it('should parse decimals properly', async function () {
    const fixture = await loadFixture(stakingNFTDescriptorSetup);
    const { stakingNFTDescriptor } = fixture.contracts;
    expect(await stakingNFTDescriptor.toFloat(BigNumber.from('614955363329695600'), 18)).to.be.equal('0.61');
    expect('0.00').to.be.equal(await stakingNFTDescriptor.toFloat(1, 3));
    expect('1.00').to.be.equal(await stakingNFTDescriptor.toFloat(1000000, 6));
    expect('1.11').to.be.equal(await stakingNFTDescriptor.toFloat(111111, 5));
    expect('1.01').to.be.equal(await stakingNFTDescriptor.toFloat(1011111, 6));
    expect('103.00').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('103'), 18));
    expect('123.00').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('123'), 18));
    expect('0.00').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('.001'), 18));
    expect('0.01').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('.01'), 18));
    expect('0.10').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('.1'), 18));
    expect('1.00').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('1'), 18));
    expect('0.00').to.be.equal(await stakingNFTDescriptor.toFloat(0, 18));
    expect('12345.67').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('12345.6789'), 18));
    expect('17.09').to.be.equal(await stakingNFTDescriptor.toFloat('17090000000000000000', 18));
    expect('0.00').to.be.equal(await stakingNFTDescriptor.toFloat(0, 0));
    expect('1111110.00').to.be.equal(await stakingNFTDescriptor.toFloat(1111110, 0));
    expect('1.00').to.be.equal(await stakingNFTDescriptor.toFloat(1, 0));
    expect('0.10').to.be.equal(await stakingNFTDescriptor.toFloat(1, 1));
    expect('0.90').to.be.equal(await stakingNFTDescriptor.toFloat(9, 1));
    expect('0.00').to.be.equal(await stakingNFTDescriptor.toFloat(0, 2));
    expect('0.01').to.be.equal(await stakingNFTDescriptor.toFloat(1, 2));
    expect('0.99').to.be.equal(await stakingNFTDescriptor.toFloat(99, 2));
    expect('0.09').to.be.equal(await stakingNFTDescriptor.toFloat(9, 2));
    expect('987654321012.00').to.be.equal(await stakingNFTDescriptor.toFloat(parseEther('987654321012'), 18));
  });
});
