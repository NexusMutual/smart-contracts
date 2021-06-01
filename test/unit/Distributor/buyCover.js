const { web3, artifacts, accounts } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { hex } = require('../utils').helpers;
const { DEFAULT_FEE_PERCENTAGE } = require('./helpers');
const { Assets: { ETH } } = require('../utils').constants;

const CoverBuyer = artifacts.require('CoverBuyer');

const [, treasury, coverHolder] = accounts;

describe('buyCover', function () {

  const ethCoverTemplate = {
    amount: ether('10'),
    price: '3362445813369838',
    priceNXM: '744892736679184',
    expireTime: '7972408607',
    generationTime: '7972408607001',
    asset: ETH,
    currency: hex('ETH'),
    period: 120,
    type: 0,
    contractAddress: '0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf',
  };

  const daiCoverTemplate = {
    amount: ether('10000'),
    price: '3362445813369838',
    priceNXM: '744892736679184',
    expireTime: '7972408607',
    generationTime: '7972408607001',
    currency: hex('DAI'),
    period: 120,
    type: 0,
    contractAddress: '0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf',
  };

  it('reverts if allowBuys = false', async function () {
    const { distributor } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const basePrice = toBN(cover.price);
    const priceWithFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000).add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await distributor.setBuysAllowed(false);
    await expectRevert(
      distributor.buyCover(
        cover.contractAddress,
        cover.asset,
        cover.amount,
        cover.period,
        cover.type,
        priceWithFee,
        data, {
          from: coverHolder,
          value: priceWithFee,
        }),
      'Distributor: buys not allowed',
    );
  });

  it('reverts if insufficient ETH sent', async function () {
    const { distributor } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await expectRevert(
      distributor.buyCover(
        cover.contractAddress,
        cover.asset,
        cover.amount,
        cover.period,
        cover.type,
        priceWithFee,
        data, {
          from: coverHolder,
          value: priceWithFee.subn(1e2),
        }),
      'Distributor: Insufficient ETH sent',
    );
    const expectedCoverId = 1;
  });

  it('reverts if cover buyer is a contract that rejects eth payments', async function () {
    const { distributor } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    const coverBuyer = await CoverBuyer.new(distributor.address);

    await expectRevert(
      coverBuyer.buyCover(
        cover.contractAddress,
        cover.asset,
        cover.amount,
        cover.period,
        cover.type,
        data, {
          from: coverHolder,
          value: priceWithFee,
        }),
      'Distributor: Returning ETH remainder to sender failed.',
    );
  });

  it('reverts if ETH payment in insufficient', async function () {
    const { distributor, dai } = this.contracts;

    const cover = { ...daiCoverTemplate, asset: dai.address };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await expectRevert(
      distributor.buyCover(
        cover.contractAddress,
        cover.asset,
        cover.amount,
        cover.period,
        cover.type,
        priceWithFee,
        data, {
          from: coverHolder,
          value: priceWithFee.subn(1e2),
        }),
      'ERC20: transfer amount exceeds balance',
    );
  });

  it('reverts if payment token approval in insufficient', async function () {
    const { distributor, dai } = this.contracts;

    const cover = { ...daiCoverTemplate, asset: dai.address };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await dai.mint(coverHolder, ether('100000'));
    await dai.approve(distributor.address, priceWithFee.subn(1e2), {
      from: coverHolder,
    });

    await expectRevert(
      distributor.buyCover(
        cover.contractAddress,
        cover.asset,
        cover.amount,
        cover.period,
        cover.type,
        priceWithFee,
        data, {
          from: coverHolder,
        }),
      'VM Exception while processing transaction: revert ERC20: transfer amount exceeds allowance',
    );
  });

  it('successfully buys ETH cover, mints cover token, sends fee to treasury and emits event', async function () {
    const { distributor } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    const treasuryEthBalanceBefore = toBN(await web3.eth.getBalance(treasury));

    const buyCoverTx = await distributor.buyCover(
      cover.contractAddress,
      cover.asset,
      cover.amount,
      cover.period,
      cover.type,
      priceWithFee,
      data, {
        from: coverHolder,
        value: priceWithFee,
      });
    const expectedCoverId = 1;

    expectEvent(buyCoverTx, 'CoverBought', {
      coverId: expectedCoverId.toString(),
      buyer: coverHolder,
      contractAddress: cover.contractAddress,
      feePercentage: DEFAULT_FEE_PERCENTAGE.toString(),
    });

    const tokenOwner = await distributor.ownerOf(expectedCoverId);
    assert.equal(tokenOwner, coverHolder);

    const treasuryEthBalanceAfter = toBN(await web3.eth.getBalance(treasury));
    assert.equal(treasuryEthBalanceAfter.sub(treasuryEthBalanceBefore).toString(), expectedFee.toString());
  });

  it('charges cover price based on updated distributor fee', async function () {
    const { distributor, cover: coverContract } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const newFeePercentage = '20000';
    await distributor.setFeePercentage(newFeePercentage);

    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(parseInt(newFeePercentage)).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    const buyCoverTx = await distributor.buyCover(
      cover.contractAddress,
      cover.asset,
      cover.amount,
      cover.period,
      cover.type,
      priceWithFee,
      data, {
        from: coverHolder,
        value: priceWithFee,
      });
    const expectedCoverId = 1;

    expectEvent(buyCoverTx, 'CoverBought', {
      coverId: expectedCoverId.toString(),
      buyer: coverHolder,
      contractAddress: cover.contractAddress,
      feePercentage: newFeePercentage.toString(),
    });
  });

  it('refunds extra ETH that exceeds price + fee', async function () {
    const { distributor, cover: coverContract } = this.contracts;

    const cover = { ...ethCoverTemplate };
    const newFeePercentage = '20000';
    await distributor.setFeePercentage(newFeePercentage);

    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(parseInt(newFeePercentage)).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    const extraEth = ether('5');
    const ethBalanceBefore = toBN(await web3.eth.getBalance(coverHolder));
    await distributor.buyCover(
      cover.contractAddress,
      cover.asset,
      cover.amount,
      cover.period,
      cover.type,
      priceWithFee,
      data, {
        from: coverHolder,
        value: priceWithFee.add(extraEth),
        gasPrice: 0,
      });
    const ethBalanceAfter = toBN(await web3.eth.getBalance(coverHolder));
    assert(ethBalanceBefore.sub(ethBalanceAfter).toString(), priceWithFee.toString());
  });

  it('successfully buys DAI cover, mints cover token, sends fees to treasury and emits event', async function () {
    const { distributor, dai } = this.contracts;

    const cover = { ...daiCoverTemplate, asset: dai.address };
    const basePrice = toBN(cover.price);
    const expectedFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000);
    const priceWithFee = expectedFee.add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await dai.mint(coverHolder, ether('1000000'));

    await dai.approve(distributor.address, priceWithFee, {
      from: coverHolder,
    });

    const buyCoverTx = await distributor.buyCover(
      cover.contractAddress,
      cover.asset,
      cover.amount,
      cover.period,
      cover.type,
      priceWithFee,
      data, {
        from: coverHolder,
      });
    const expectedCoverId = 1;

    expectEvent(buyCoverTx, 'CoverBought', {
      coverId: expectedCoverId.toString(),
      buyer: coverHolder,
      contractAddress: cover.contractAddress,
      feePercentage: DEFAULT_FEE_PERCENTAGE.toString(),
    });

    const tokenOwner = await distributor.ownerOf(expectedCoverId);
    assert.equal(tokenOwner, coverHolder);

    const treasuryDaiBalance = await dai.balanceOf(treasury);
    assert.equal(treasuryDaiBalance.toString(), expectedFee.toString());
  });
});
