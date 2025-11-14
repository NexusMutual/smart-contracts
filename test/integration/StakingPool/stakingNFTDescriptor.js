const { ethers, nexus } = require('hardhat');
const base64 = require('base64-js');
const { expect } = require('chai');
const { loadFixture, time, mine } = require('@nomicfoundation/hardhat-network-helpers');

const setup = require('../setup');
const { daysToSeconds, getFundedSigner } = require('../utils');

const { calculateFirstTrancheId } = nexus.protocol;
const { parseEther, formatEther, MaxUint256 } = ethers;

const svgHeader = 'data:image/svg+xml;base64,';
const jsonHeader = 'data:application/json;base64,';

async function createStakingDeposit(fixture) {
  const { members } = fixture.accounts;
  const [, , staker] = members;

  const { stakingPool1, token, tokenController } = fixture.contracts;
  const stakingAmount = parseEther('170.091');
  const latestTimestamp = await time.latest();
  const firstTrancheId = calculateFirstTrancheId(latestTimestamp, 60, 30);

  const operatorAddress = await token.operator();
  const operator = await getFundedSigner(operatorAddress, parseEther('10000'));

  // set balances
  await token.connect(operator).mint(staker.address, parseEther('10000'));
  await token.connect(staker).approve(tokenController.target, MaxUint256);

  // tokenIdA large deposit
  const largeDepositAmount = stakingAmount * 2n;
  const tokenAParams = [largeDepositAmount, firstTrancheId, 0, staker.address];
  const tokenIdA = await stakingPool1.connect(staker).depositTo.staticCall(...tokenAParams);
  await stakingPool1.connect(staker).depositTo(...tokenAParams);

  // tokenIdB small deposit
  const smallDepositAmount = stakingAmount;
  const tokenBParams = [smallDepositAmount, firstTrancheId + 1, 0, staker.address];
  const tokenIdB = await stakingPool1.connect(staker).depositTo.staticCall(...tokenBParams);
  await stakingPool1.connect(staker).depositTo(...tokenBParams);

  return {
    tokenIdA,
    tokenIdB,
    largeDepositAmount,
    smallDepositAmount,
    firstTrancheId,
    stakingAmount,
  };
}

describe('StakingNFTDescriptor', function () {
  it('tokenURI json output should be formatted properly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingNFT } = fixture.contracts;

    const { tokenIdA, largeDepositAmount, firstTrancheId } = await createStakingDeposit(fixture);

    const uri = await stakingNFT.tokenURI(tokenIdA);

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);

    const { description } = decodedJson;
    const expectedTotalStake = formatEther(largeDepositAmount);
    expect(description).to.contain(`Staked amount: ${Number(expectedTotalStake).toFixed(2)} NXM`);
    expect(description).to.contain('Pending rewards: 0.00 NXM');

    // active deposits
    expect(description).to.contain('Active deposits:');
    const largeDepositFormatted = Number(formatEther(largeDepositAmount)).toFixed(2);
    expect(description).to.contain(`-${largeDepositFormatted} NXM will expire at tranche:`);

    // tranche
    const expectedTrancheA = firstTrancheId.toString();
    expect(description).to.contain(`-${largeDepositFormatted} NXM will expire at tranche: ${expectedTrancheA}`);

    const depositMatches = description.match(new RegExp(`-${largeDepositFormatted} NXM will expire at tranche:`, 'g'));
    expect(depositMatches).to.have.length(1, 'Should show single large deposit in active deposits section');

    const expectedAmount = formatEther(largeDepositAmount);
    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    expect(decodedSvg).to.match(new RegExp(`<tspan>${tokenIdA.toString()}<\\/tspan>`));
    expect(decodedSvg).to.contain(Number(expectedAmount).toFixed(2));
  });

  it('tokenURI with single deposit should be formatted properly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingNFT } = fixture.contracts;

    const { tokenIdB, smallDepositAmount, firstTrancheId, stakingAmount } = await createStakingDeposit(fixture);
    const uri = await stakingNFT.tokenURI(Number(tokenIdB));

    const jsonHeader = 'data:application/json;base64,';
    expect(uri.slice(0, jsonHeader.length)).to.be.equal(jsonHeader);

    const expectedDepositAmount = Number(formatEther(stakingAmount)).toFixed(2);
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.name).to.be.equal('Nexus Mutual Deposit');
    expect(decodedJson.description.length).to.be.gt(0);

    const { description } = decodedJson;

    const expectedTotalStake = formatEther(smallDepositAmount);
    expect(description).to.contain(`Staked amount: ${Number(expectedTotalStake).toFixed(2)} NXM`);
    expect(description).to.contain('Pending rewards: 0.00 NXM');

    // active deposits
    expect(description).to.contain('Active deposits:');
    expect(description).to.contain(`-${expectedDepositAmount} NXM will expire at tranche:`);

    // trancheId
    const expectedTrancheB = (firstTrancheId + 1).toString();
    expect(description).to.contain(`-${expectedDepositAmount} NXM will expire at tranche: ${expectedTrancheB}`);

    const depositMatches = description.match(new RegExp(`-${expectedDepositAmount} NXM will expire at tranche:`, 'g'));
    expect(depositMatches).to.have.length(1, 'Should show single small deposit in active deposits section');

    expect(decodedJson.image.slice(0, svgHeader.length)).to.be.equal(svgHeader);
    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    expect(decodedSvg).to.match(new RegExp(`<tspan>${tokenIdB.toString()}<\\/tspan>`));
    expect(decodedSvg).to.contain(Number(expectedDepositAmount).toFixed(2));
  });

  it('should handle expired tokens', async function () {
    const fixture = await loadFixture(setup);
    const { stakingNFT } = fixture.contracts;

    const { tokenIdA } = await createStakingDeposit(fixture);

    const timestamp = await time.latest();
    await time.setNextBlockTimestamp(timestamp + daysToSeconds(1000));
    await mine();

    const uri = await stakingNFT.tokenURI(Number(tokenIdA));
    const decodedJson = JSON.parse(new TextDecoder().decode(base64.toByteArray(uri.slice(jsonHeader.length))));
    expect(decodedJson.description).to.contain('Deposit has expired');

    const decodedSvg = new TextDecoder().decode(base64.toByteArray(decodedJson.image.slice(svgHeader.length)));
    // poolId + tokenID
    expect(decodedSvg).to.match(/<tspan>1<\/tspan>/);
    expect(decodedSvg).to.match(/<tspan>0.00 NXM<\/tspan>/);
  });

  it('should parse random decimals properly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingNFTDescriptor } = fixture.contracts;

    const promises = [];
    for (let i = 0; i < 100; i++) {
      const random = Math.random().toFixed(18);
      const randomWei = parseEther(random.toString());

      const expected = formatEther(randomWei);
      promises.push(
        stakingNFTDescriptor.toFloat(randomWei, 18).then(res => {
          expect(res).to.be.equal(expected.slice(0, 4));
        }),
      );
    }

    await Promise.all(promises);
  });

  it('should parse decimals properly', async function () {
    const fixture = await loadFixture(setup);
    const { stakingNFTDescriptor } = fixture.contracts;
    expect(await stakingNFTDescriptor.toFloat(614955363329695600n, 18)).to.be.equal('0.61');
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
