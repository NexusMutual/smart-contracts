const NXMToken1 = artifacts.require("NXMToken1");
const Pool1 = artifacts.require("Pool1");
const MCR = artifacts.require("MCR");
const owner = web3.eth.accounts[0];
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
const ETH = "0x455448";

const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

let nxmtk1;
let P1;
let m1;

describe('Contract: 03_Pool1', function () {
	this.timeout(0)
	const P_18 = new BigNumber(1e18);
	const tokenAmount = new BigNumber(5e18);
	const sellTokens = new BigNumber(35e17);
	before(function() {
                NXMToken1.deployed().then(function(instance) {
                        nxmtk1 = instance;
                        return Pool1.deployed();
                }).then(function(instance) {
                        P1 = instance;
                        return MCR.deployed();
                }).then(function(instance) {
                        m1 = instance;
                });
        });
	it('should able to buy tokens', async function () {
		let initialTokens = await nxmtk1.totalBalanceOf(member);
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.buyTokenBegin({from:member, value:tokenAmount});
		let tokens = (await nxmtk1.totalBalanceOf(member));
		let tokens3d = (tokens.div(P_18)).toFixed(3);
		let tokenPrice = (await m1.calculateTokenPrice(ETH));
		let tka = (tokenAmount.div(tokenPrice)).add((initialTokens.div(P_18)));
		let tokensAvailable = tka.toFixed(3);
		let presentPoolBalance = await P1.getEtherPoolBalance();
		presentPoolBalance.should.be.bignumber.equal(initialPoolBalance.plus(tokenAmount));
		tokens3d.should.be.bignumber.equal(tokensAvailable);
	});

	it('should able to buy more tokens', async function () {	
		this.timeout(0);
		let initialTokens = await nxmtk1.totalBalanceOf(member);
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.buyTokenBegin({from: member, value: tokenAmount});
		let tokenPrice = await m1.calculateTokenPrice(ETH);
		let tokens = await nxmtk1.totalBalanceOf(member);
		let tokens3d = (tokens.div(P_18)).toFixed(3);
		let tka = (tokenAmount.div(tokenPrice)).add((initialTokens.div(P_18)));
		let tokensAvailable = tka.toFixed(3);
		let presentPoolBalance = await P1.getEtherPoolBalance();
		presentPoolBalance.should.be.bignumber.equal(initialPoolBalance.plus(tokenAmount));
		tokens3d.should.be.bignumber.equal(tokensAvailable);
	});

	it('should able to sell tokens', async function () {
		this.timeout(0);
		let initialTokens = (await nxmtk1.totalBalanceOf(member));
		let tokenPrice = await m1.calculateTokenPrice(ETH);
		let sellPrice = (tokenPrice.times(new BigNumber(97.5))).div(new BigNumber(100));
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.sellNXMTokens(sellTokens, {from:member});
		let worthTokens = sellPrice.times((sellTokens.div(P_18)));
		let tokens = await nxmtk1.totalBalanceOf(member);
		let tokens3d = (tokens.div(P_18)).toFixed(3);
		let tka = (initialTokens.minus(sellTokens)).div(P_18);
		let tokensAvailable = tka.toFixed(3);
		tokens3d.should.be.bignumber.equal(tokensAvailable);
		let presentPoolBalance = await P1.getEtherPoolBalance();
		let newPoolBalance = initialPoolBalance.minus(worthTokens);
		presentPoolBalance.should.be.bignumber.equal(newPoolBalance);
	});
});
