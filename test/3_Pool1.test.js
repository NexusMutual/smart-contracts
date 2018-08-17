const NXMToken1 = artifacts.require("NXMToken1");
const Pool1 = artifacts.require("Pool1");
const MCR = artifacts.require("MCR");
// const member1 = web3.eth.accounts[4];
const tokenAmount = web3.toWei(1);
const sellTokens = web3.toWei(10);
let nxmtk1;
let P1;
let m1;
const BigNumber = web3.BigNumber;
require('chai')
  .use(require('chai-bignumber')(BigNumber))
  .should();

contract('Pool1', function () {
	it('should able to buy tokens', async function (accounts) {
		P1 = await Pool1.deployed();
		nxmtk1 = await NXMToken1.deployed();
		m1 = await MCR.deployed();
		console.log("gg1");
		let initialTokens = await nxmtk1.totalBalanceOf(accounts[4]);
		console.log("initialTokens:",initialTokens);
		let tokenPrice = await m1.calculateTokenPrice("0x455448");
		console.log("tokenPrice:",tokenPrice);
		let initialPoolBalance = await P1.getEtherPoolBalance();
		console.log("initialPoolBalance:",initialPoolBalance);
		await P1.buyTokenBegin({from:accounts[4], value:tokenAmount});
		console.log("boughttokens");
		let tokens = await nxmtk1.totalBalanceOf(accounts[4]);
		console.log("tokens:",tokens);
		let tokensAvailable= (tokenAmount/tokenPrice) + initialTokens;
		console.log("tokensAvailable:",tokensAvailable);
		let presentPoolBalance = await P1.getEtherPoolBalance();
		console.log("presentPoolBalance:",presentPoolBalance);
		presentPoolBalance.should.be.bignumber.equal(initialPoolBalance+tokenAmount);
		console.log("gg");
		tokens.should.be.bignumber.equal(tokensAvailable);
	});

	it('should able to buy more tokens', async function () {
		
		let initialTokens = await nxmtk1.totalBalanceOf(member1);
		let tokenPrice = await m1.calculateTokenPrice("0x455448");
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.buyTokenBegin({from:member1,value:tokenAmount});
		let tokens = await nxmtk1.totalBalanceOf(member1);
		let tokensAvailable= (tokenAmount/tokenPrice) + initialTokens;
		let presentPoolBalance = await P1.getEtherPoolBalance();
		presentPoolBalance.should.be.bignumber.equal(initialPoolBalance+tokenAmount);
		tokens.should.be.bignumber.equal(tokensAvailable);
	});

	it('should able to sell tokens', async function () {
		let initialTokens = await nxmtk1.totalBalanceOf(member1);
		let tokenPrice = await m1.calculateTokenPrice("0x455448");
		let sellPrice = tokenPrice * 97.5 / 100;
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.sellNXMTokens(sellTokens, {from:member1});
		let worthTokens = sellPrice * sellTokens;
		let tokens = await nxmtk1.totalBalanceOf(member1);
		let tokensAvailable = initialTokens - sellTokens;
		tokensAvailable.should.be.bignumber.equal(tokens);
		let presentPoolBalance = await P1.getEtherPoolBalance();
		presentPoolBalance.should.be.bignumber.equal(initialPoolBalance - worthTokens);
	});
});
