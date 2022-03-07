/* eslint-disable no-unused-expressions */
const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance } = require('../../utils/evm');

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes },
} = ethers;

describe('closeOrder', function () {
  let signer, otherSigner;

  let order, contractOrder, domain, orderUID;

  let dai, weth, pool, swapOperator, cowSettlement, cowVaultRelayer, twap;

  const hashUtf = str => keccak256(toUtf8Bytes(str));

  const makeContractOrder = (order) => {
    return {
      ...order,
      kind: hashUtf(order.kind),
      sellTokenBalance: hashUtf(order.sellTokenBalance),
      buyTokenBalance: hashUtf(order.buyTokenBalance),
    };
  };

  const setupSellDaiForEth = async () => {
    // Set DAI balance above asset max, so we can sell it
    await dai.setBalance(pool.address, parseEther('25000'));

    // Set reasonable amounts for DAI so selling doesnt bring balance below min
    const newOrder = {
      ...order,
      sellToken: dai.address,
      buyToken: weth.address,
      sellAmount: parseEther('9999'),
      feeAmount: parseEther('1'),
      buyAmount: parseEther('2'),
    };
    const newContractOrder = makeContractOrder(newOrder);
    const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
    return { newOrder, newContractOrder, newOrderUID };
  };

  beforeEach(async () => {
    [signer, otherSigner] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;
    twap = contracts.twap;

    // Build order struct, domain separator and calculate UID
    order = {
      sellToken: weth.address,
      buyToken: dai.address,
      sellAmount: parseEther('0.999'),
      buyAmount: parseEther('3000'),
      validTo: Math.floor(new Date().getTime() / 1000 + 650),
      appData: hexZeroPad(0, 32),
      feeAmount: parseEther('0.001'),
      kind: 'sell',
      receiver: swapOperator.address,
      partiallyFillable: false,
      sellTokenBalance: 'erc20',
      buyTokenBalance: 'erc20',
    };

    contractOrder = {
      ...order,
      kind: hashUtf(order.kind),
      sellTokenBalance: hashUtf(order.sellTokenBalance),
      buyTokenBalance: hashUtf(order.buyTokenBalance),
    };

    const { chainId } = await ethers.provider.getNetwork();
    domain = makeDomain(chainId, cowSettlement.address);
    orderUID = computeOrderUid(domain, order, order.receiver);

    // Fund the contracts
    await setEtherBalance(pool.address, parseEther('1000000'));
    await setEtherBalance(weth.address, parseEther('1000000'));
    await dai.mint(cowVaultRelayer.address, parseEther('1000000'));

    // Set price in oracle
    await (await twap.addPrice(weth.address, dai.address, 5000 * 10000)).wait(); // 1 weth = 5000 dai

    // place order
    await swapOperator.placeOrder(contractOrder, orderUID);
  });

  it('is callable only by swap controller', async function () {
    // call with non-controller, should fail
    await expect(
      swapOperator.connect(otherSigner).closeOrder(contractOrder),
    ).to.revertedWith('SwapOp: only controller can execute');

    // call with controller, should succeed
    await expect(
      swapOperator.connect(signer).closeOrder(contractOrder),
    ).to.not.be.reverted;
  });

  it('computes order UID on-chain and validates against placed order UID', async function () {
    // the contract's currentOrderUID is the one for the placed order in beforeEach step
    // we call with multiple invalid orders, with each individual field modified. it should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        swapOperator.closeOrder(wrongOrder),
      ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');
    }

    // call with an order that matches currentOrderUID, should succeed
    await expect(
      swapOperator.closeOrder(contractOrder),
    ).to.not.be.reverted;
  });

  it('validates that theres an order in place', async function () {
    // cancel the current order, leaving no order in place
    await expect(swapOperator.closeOrder(contractOrder)).to.not.be.reverted;

    await expect(swapOperator.closeOrder(contractOrder)).to.be.revertedWith('SwapOp: No order in place');
  });

  describe('canceling the presignature and allowance', function () {
    it('does so if the order was not filled at all', async function () {
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(order.sellAmount.add(order.feeAmount));

      await swapOperator.closeOrder(contractOrder);

      expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });

    it('does so if the order is partially filled', async function () {
      // intially there is some sellToken, no buyToken
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // Fill 50% of order
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount.div(2), order.feeAmount.div(2), order.buyAmount.div(2));

      // now there is some sellToken and buyToken
      expect(await dai.balanceOf(swapOperator.address)).to.gt(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // presignature still valid, allowance was decreased
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(order.sellAmount.div(2).add(order.feeAmount.div(2)));

      await swapOperator.closeOrder(contractOrder);

      // after closing, presignature = false and allowance = 0
      expect(await cowSettlement.presignatures(orderUID)).to.equal(false);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });

    it('doesnt cancel the presignature if the order was fully filled', async function () {
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(order.sellAmount.add(order.feeAmount));
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await weth.balanceOf(swapOperator.address)).to.gt(0);

      // fill 100% of the order
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      // after filling, there's only buyToken balance
      expect(await dai.balanceOf(swapOperator.address)).to.be.gt(0);
      expect(await weth.balanceOf(swapOperator.address)).to.eq(0);

      await swapOperator.closeOrder(contractOrder);

      // After closing, there's 0 allowance because all has been used up, but presignature is not canceled to save gas
      expect(await cowSettlement.presignatures(orderUID)).to.equal(true);
      expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);
    });
  });

  it('clears the currentOrderUID variable', async function () {
    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);

    await swapOperator.closeOrder(contractOrder);

    expect(await swapOperator.currentOrderUID()).to.eq('0x');
  });

  describe('withdrawing buyToken to pool', function () {
    it('withdraws and unwraps ether if buyToken is weth', async function () {
      // Cancel current order
      await swapOperator.closeOrder(contractOrder);

      // Place new order that is selling dai for weth
      // const newOrder = {
      //   ...order,
      //   sellToken: dai.address,
      //   buyToken: weth.address,
      // };
      // const newContractOrder = {
      //   ...contractOrder,
      //   sellToken: dai.address,
      //   buyToken: weth.address,
      // };
      // const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      // await dai.setBalance(pool.address, parseEther('25000'));

      const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth();

      await dai.mint(pool.address, order.sellAmount.add(order.feeAmount));
      await weth.mint(cowVaultRelayer.address, order.buyAmount);
      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      const initialPoolEth = await ethers.provider.getBalance(pool.address);

      await cowSettlement.fill(newContractOrder, newOrderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      expect(await weth.balanceOf(swapOperator.address)).to.eq(order.buyAmount);
      expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth);

      await swapOperator.closeOrder(newContractOrder);

      expect(await weth.balanceOf(swapOperator.address)).to.eq(0);
      expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth.add(order.buyAmount));
    });

    it('transfer the erc20 token if its not weth', async function () {
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await dai.balanceOf(pool.address)).to.eq(0);

      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      expect(await dai.balanceOf(swapOperator.address)).to.eq(order.buyAmount);

      await swapOperator.closeOrder(contractOrder);

      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
      expect(await dai.balanceOf(pool.address)).to.eq(order.buyAmount);
    });
  });

  describe('returning sellToken to pool', function () {
    it('withdraws and unwraps ether if sellToken is weth', async function () {
      const initialPoolEth = await ethers.provider.getBalance(pool.address);
      const initialOperatorWeth = await weth.balanceOf(swapOperator.address);

      expect(initialPoolEth).to.be.gt(0);
      expect(initialOperatorWeth).to.be.gt(0);

      await swapOperator.closeOrder(contractOrder);

      expect(await ethers.provider.getBalance(pool.address)).to.eq(initialPoolEth.add(initialOperatorWeth));
      expect(await weth.balanceOf(swapOperator.address)).to.eq(0);
    });

    it('transfers the erc20 token to pool if its not weth', async function () {
      // Cancel current order
      await swapOperator.closeOrder(contractOrder);

      const { newOrder, newContractOrder, newOrderUID } = await setupSellDaiForEth();

      await weth.mint(cowVaultRelayer.address, order.buyAmount);
      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      const checkpointPoolDai = await dai.balanceOf(pool.address);
      const checkpointOperatorDai = await dai.balanceOf(swapOperator.address);

      expect(checkpointOperatorDai).to.eq(newOrder.sellAmount.add(newOrder.feeAmount));

      await swapOperator.closeOrder(newContractOrder);

      expect(await dai.balanceOf(pool.address)).to.eq(checkpointPoolDai.add(checkpointOperatorDai));
      expect(await dai.balanceOf(swapOperator.address)).to.eq(0);
    });
  });

  describe('emitting OrderClosed event', function () {
    it('when order was not filled', async function () {
      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(0);
    });

    it('when order was partially filled', async function () {
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount.div(2), order.feeAmount.div(2), order.buyAmount.div(2));

      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(order.sellAmount.div(2));
    });

    it('when order was fully filled', async function () {
      await cowSettlement.fill(contractOrder, orderUID, order.sellAmount, order.feeAmount, order.buyAmount);

      const tx = await swapOperator.closeOrder(contractOrder);
      const rcp = await tx.wait();

      const event = rcp.events.find(e => e.event === 'OrderClosed');

      expect(event.args.order).to.deep.include.members(Object.values(contractOrder));
      expect(event.args.filledAmount).to.eq(order.sellAmount);
    });
  });
});
