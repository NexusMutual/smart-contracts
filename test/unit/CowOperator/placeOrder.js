const { contracts, makeWrongValue } = require('./setup');
const { ethers } = require('hardhat');
const { expect } = require('chai');
const { domain: makeDomain, computeOrderUid } = require('@gnosis.pm/gp-v2-contracts');
const { setEtherBalance } = require('../../utils/evm');

const {
  utils: { parseEther, hexZeroPad, keccak256, toUtf8Bytes, hexlify, randomBytes },
} = ethers;

const hashUtf = str => keccak256(toUtf8Bytes(str));

describe('placeOrder', function () {
  let signer, otherSigner;

  let order, contractOrder, domain, orderUID;

  let dai, weth, pool, swapOperator, twap, cowSettlement, cowVaultRelayer;

  beforeEach(async () => {
    [signer, otherSigner] = await ethers.getSigners();

    // Assign contracts (destructuring isn't working)
    dai = contracts.dai;
    weth = contracts.weth;
    pool = contracts.pool;
    swapOperator = contracts.swapOperator;
    twap = contracts.twap;
    cowSettlement = contracts.cowSettlement;
    cowVaultRelayer = contracts.cowVaultRelayer;

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

    // Fund the pool contract
    await setEtherBalance(pool.address, parseEther('100'));

    // Set price in oracle
    await (await twap.addPrice(weth.address, dai.address, 5000 * 10000)).wait(); // 1 weth = 5000 dai
  });

  it('is callable only by swap controller', async function () {
    // call with non-controller, should fail
    await expect(
      swapOperator.connect(otherSigner).placeOrder(contractOrder, orderUID),
    ).to.revertedWith('SwapOp: only controller can execute');

    // call with controller, should succeed
    await expect(
      swapOperator.connect(signer).placeOrder(contractOrder, orderUID),
    ).to.not.be.reverted;
  });

  it('computes order UID on-chain and validates against passed value', async function () {
    // call with invalid UID, should fail
    const wrongUID = hexlify(randomBytes(56));
    await expect(
      swapOperator.placeOrder(contractOrder, wrongUID),
    ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');

    // call with invalid struct, with each individual field modified, should fail
    for (const [key, value] of Object.entries(contractOrder)) {
      const wrongOrder = {
        ...contractOrder,
        [key]: makeWrongValue(value),
      };
      await expect(
        swapOperator.placeOrder(wrongOrder, orderUID),
      ).to.revertedWith('SwapOp: Provided UID doesnt match calculated UID');
    }

    // call with valid order and UID, should succeed
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID),
    ).to.not.be.reverted;
  });

  it('validates theres no other order already placed', async function () {
    // calling with valid data should succeed first time
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID),
    ).to.not.be.reverted;

    // calling with valid data should fail second time, because first order is still there
    await expect(
      swapOperator.placeOrder(contractOrder, orderUID),
    ).to.be.revertedWith('SwapOp: an order is already in place');
  });

  describe('validating basic CoW protocol parameters', function () {
    it('validates only erc20 is supported for sellTokenBalance', async function () {
      const newOrder = {
        ...order,
        sellTokenBalance: 'external',
      };
      const newContractOrder = {
        ...contractOrder,
        sellTokenBalance: hashUtf('external'),
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only erc20 supported for sellTokenBalance');
    });

    it('validates only erc20 is supported for buyTokenBalance', async function () {
      const newOrder = {
        ...order,
        buyTokenBalance: 'internal',
      };
      const newContractOrder = {
        ...contractOrder,
        buyTokenBalance: hashUtf('internal'),
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only erc20 supported for buyTokenBalance');
    });

    it('validates only sell operations are supported', async function () {
      const newOrder = {
        ...order,
        kind: 'buy',
      };
      const newContractOrder = {
        ...contractOrder,
        kind: hashUtf('buy'),
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Only sell operations are supported');
    });

    it('validates the receiver of the swap is the swap operator contract', async function () {
      const newOrder = {
        ...order,
        receiver: otherSigner.address,
      };
      const newContractOrder = {
        ...contractOrder,
        receiver: otherSigner.address,
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: Receiver must be this contract');
    });

    it('validates that deadline is at least 10 minutes in the future', async function () {
      const newOrder = {
        ...order,
        validTo: Math.floor(new Date().getTime() / 1000 + 599),
      };
      const newContractOrder = {
        ...contractOrder,
        validTo: Math.floor(new Date().getTime() / 1000 + 599),
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: validTo must be at least 10 minutes in the future');
    });
  });

  describe('validating there are asset details for sellToken', function () {
    it('doesnt perform validation when sellToken is WETH, because eth is used', async function () {
      // Ensure eth (weth) is disabled by checking min and max amount
      const swapDetails = await pool.getAssetSwapDetails(weth.address);
      expect(swapDetails.minAmount).to.eq(0);
      expect(swapDetails.maxAmount).to.eq(0);

      // Order selling WETH (eth) still should succeed
      await expect(
        swapOperator.placeOrder(contractOrder, orderUID),
      ).to.not.be.reverted;
      //
    });

    it('performs the validation when sellToken is not WETH', async function () {
      // Since DAI was already registered on setup, set its details to 0
      await pool.connect(otherSigner).setSwapDetails(dai.address, 0, 0, 0); // otherSigner is governant

      const newOrder = {
        ...order,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newContractOrder = {
        ...contractOrder,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

      // Order selling DAI should fail
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.be.revertedWith('SwapOp: sellToken is not enabled');
    });
  });

  describe('validating there are asset details for buyToken', function () {
    it('doesnt perform validation when buyToken is WETH, because eth is used', async function () {
      // Ensure eth (weth) is disabled by checking min and max amount
      const swapDetails = await pool.getAssetSwapDetails(weth.address);
      expect(swapDetails.minAmount).to.eq(0);
      expect(swapDetails.maxAmount).to.eq(0);

      const newOrder = {
        ...order,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newContractOrder = {
        ...contractOrder,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

      // Mint dai for pool
      await dai.mint(pool.address, order.buyAmount.add(order.feeAmount));

      // Order buying WETH (eth) still should succeed
      await expect(
        swapOperator.placeOrder(newContractOrder, newOrderUID),
      ).to.not.be.reverted;
      //
    });

    it('performs the validation when buyToken is not WETH', async function () {
      // Since DAI was already registered on setup, set its details to 0
      await pool.connect(otherSigner).setSwapDetails(dai.address, 0, 0, 0); // otherSigner is governant

      // Order buying DAI should fail
      await expect(
        swapOperator.placeOrder(contractOrder, orderUID),
      ).to.be.revertedWith('SwapOp: buyToken is not enabled');
    });
  });

  describe('pulling funds from pool', function () {
    it('transfers ether from pool and wrap it into WETH when sellToken is WETH', async function () {
      const poolEthBefore = await ethers.provider.getBalance(pool.address);
      const swapOpWethBefore = await weth.balanceOf(swapOperator.address);

      await swapOperator.placeOrder(contractOrder, orderUID);

      const poolEthAfter = await ethers.provider.getBalance(pool.address);
      const swapOpWethAfter = await weth.balanceOf(swapOperator.address);

      expect(poolEthBefore.sub(poolEthAfter)).to.eq(order.sellAmount.add(order.feeAmount));
      expect(swapOpWethAfter.sub(swapOpWethBefore)).to.eq(order.sellAmount.add(order.feeAmount));
    });

    it('transfer erc20 asset from pool to eth if sellToken is not WETH', async function () {
      const newOrder = {
        ...order,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newContractOrder = {
        ...contractOrder,
        sellToken: dai.address,
        buyToken: weth.address,
      };
      const newOrderUID = computeOrderUid(domain, newOrder, newOrder.receiver);

      await dai.mint(pool.address, order.sellAmount.add(order.feeAmount));

      const poolDaiBefore = await dai.balanceOf(pool.address);
      const swapOpDaiBefore = await dai.balanceOf(swapOperator.address);

      await swapOperator.placeOrder(newContractOrder, newOrderUID);

      const poolDaiAfter = await dai.balanceOf(pool.address);
      const swapOpDaiAfter = await dai.balanceOf(swapOperator.address);

      expect(poolDaiBefore.sub(poolDaiAfter)).to.eq(order.sellAmount.add(order.feeAmount));
      expect(swapOpDaiAfter.sub(swapOpDaiBefore)).to.eq(order.sellAmount.add(order.feeAmount));
    });
  });

  it('approves CoW vault relayer to spend the exact amount of sellToken', async function () {
    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(0);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await weth.allowance(swapOperator.address, cowVaultRelayer.address)).to.eq(
      order.sellAmount.add(order.feeAmount),
    );
  });

  it('stores the current orderUID in the contract', async function () {
    expect(await swapOperator.currentOrderUID()).to.eq('0x');

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await swapOperator.currentOrderUID()).to.eq(orderUID);
  });

  it('calls setPreSignature on CoW settlement contract', async function () {
    expect(await cowSettlement.presignatures(orderUID)).to.eq(false);

    await swapOperator.placeOrder(contractOrder, orderUID);

    expect(await cowSettlement.presignatures(orderUID)).to.eq(true);
  });

  it('emits an OrderPlaced event', async function () {
    const tx = await swapOperator.placeOrder(contractOrder, orderUID);
    const rcp = await tx.wait();

    expect(rcp.events[2].args.order).to.deep.include.members(Object.values(contractOrder));
  });
});
