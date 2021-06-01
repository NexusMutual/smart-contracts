const { accounts, web3, artifacts } = require('hardhat');
const { ether, expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const { assert } = require('chai');
const { toBN } = web3.utils;
const { hex } = require('../utils').helpers;
const { DEFAULT_FEE_PERCENTAGE } = require('./helpers');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers').constants;
const { Assets: { ETH } } = require('../utils').constants;
const BN = web3.utils.BN;

const [, coverHolder] = accounts;

describe('executeCoverAction', function () {

  beforeEach(async function () {
    const { dai } = this.contracts;
    await dai.mint(coverHolder, ether('1000000'));
  });

  it('executes custom action on an owned cover to top up its ETH value', async function () {
    const { distributor, gateway } = this.contracts;

    const cover = {
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

    const basePrice = toBN(cover.price);
    const priceWithFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000).add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await distributor.buyCover(
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

    const coverId = 1;

    const desiredTopUpAmount = ether('1');
    const sentTopUpAmount = desiredTopUpAmount.muln(2);

    const action = 0;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [desiredTopUpAmount.toString()]);

    const coverContractBalanceBefore = toBN(await web3.eth.getBalance(gateway.address));
    await distributor.executeCoverAction(coverId, sentTopUpAmount, ETH, action, executeData, {
      from: coverHolder,
      value: sentTopUpAmount,
    });

    const { topUp } = await gateway.covers(coverId);
    assert.equal(topUp.toString(), desiredTopUpAmount.toString());
    const coverContractBalanceAfter = toBN(await web3.eth.getBalance(gateway.address));
    assert.equal(coverContractBalanceAfter.sub(coverContractBalanceBefore).toString(), desiredTopUpAmount.toString());
  });

  it('executes custom action on an owned cover with a DAI transfer', async function () {
    const { distributor, gateway, dai } = this.contracts;

    const cover = {
      amount: ether('10000'),
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      asset: dai.address,
      currency: hex('DAI'),
      period: 120,
      type: 0,
      contractAddress: '0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf',
    };

    const basePrice = toBN(cover.price);
    const priceWithFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000).add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await dai.approve(distributor.address, priceWithFee, {
      from: coverHolder,
    });

    await distributor.buyCover(
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

    const coverId = 1;
    const desiredTopUpAmount = ether('1000');
    const sentTopUpAmount = desiredTopUpAmount.muln(2);

    const action = 1;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [desiredTopUpAmount]);

    await dai.approve(distributor.address, sentTopUpAmount, {
      from: coverHolder,
    });

    const coverContractBalanceBefore = await dai.balanceOf(gateway.address);
    await distributor.executeCoverAction(coverId, sentTopUpAmount, dai.address, action, executeData, {
      from: coverHolder,
    });
    const coverContractBalanceAfter = await dai.balanceOf(gateway.address);

    const { topUp } = await gateway.covers(coverId);
    assert.equal(topUp.toString(), desiredTopUpAmount.toString());
    assert.equal(coverContractBalanceAfter.sub(coverContractBalanceBefore).toString(), desiredTopUpAmount.toString());
  });

  it('reverts on cover action that doesn\'t send enough ETH', async function () {
    const { distributor, gateway } = this.contracts;

    const cover = {
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

    const basePrice = toBN(cover.price);
    const priceWithFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000).add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await distributor.buyCover(
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

    const coverId = 1;

    const desiredTopUpAmount = ether('1');
    const sentTopUpAmount = desiredTopUpAmount.muln(2);

    const action = 0;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [desiredTopUpAmount.toString()]);
    await expectRevert(
      distributor.executeCoverAction(coverId, sentTopUpAmount, ETH, action, executeData, {
        from: coverHolder,
        value: sentTopUpAmount.subn(1),
      }),
      'Distributor: Insufficient ETH sent',
    );
  });

  it('reverts on cover action that doesn\'t approve enough DAI', async function () {
    const { distributor, gateway, dai } = this.contracts;

    const cover = {
      amount: ether('10000'),
      price: '3362445813369838',
      priceNXM: '744892736679184',
      expireTime: '7972408607',
      generationTime: '7972408607001',
      asset: dai.address,
      currency: hex('DAI'),
      period: 120,
      type: 0,
      contractAddress: '0xd0a6E6C54DbC68Db5db3A091B171A77407Ff7ccf',
    };

    const basePrice = toBN(cover.price);
    const priceWithFee = basePrice.muln(DEFAULT_FEE_PERCENTAGE).divn(10000).add(basePrice);

    const data = web3.eth.abi.encodeParameters(['uint'], [basePrice]);

    await dai.approve(distributor.address, priceWithFee, {
      from: coverHolder,
    });

    await distributor.buyCover(
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

    const coverId = 1;
    const desiredTopUpAmount = ether('1000');
    const sentTopUpAmount = desiredTopUpAmount.muln(2);

    const action = 1;
    const executeData = web3.eth.abi.encodeParameters(['uint'], [desiredTopUpAmount]);

    await dai.approve(distributor.address, sentTopUpAmount.subn(1), {
      from: coverHolder,
    });

    await expectRevert.unspecified(
      distributor.executeCoverAction(coverId, sentTopUpAmount, dai.address, action, executeData, {
        from: coverHolder,
      }),
    );
  });
});
