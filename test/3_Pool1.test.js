const NXMToken1 = artifacts.require("NXMToken1");
const Pool1 = artifacts.require("Pool1");
const MCR = artifacts.require("MCR");
const tokenAmount = web3.toWei(1);
const sellTokens = web3.toWei(10);
const owner = web3.eth.accounts[0];
const member = web3.eth.accounts[1];
const receiver = web3.eth.accounts[2];
let nxmtk1;
let P1;
let m1;

require('chai')
  .should();

describe('Pool1', function () {
	it('should able to buy tokens', async function () {
		P1 = await Pool1.deployed();
		nxmtk1 = await NXMToken1.deployed();
		m1 = await MCR.deployed();
		let initialTokens = (await nxmtk1.totalBalanceOf(member)).toNumber();
		let initialPoolBalance = (await P1.getEtherPoolBalance()).toNumber();
		await P1.buyTokenBegin({from:member, value:tokenAmount});
		let tokens = (await nxmtk1.totalBalanceOf(member)).toNumber();
		let tokens3d = (tokens/1e18).toFixed(3);
		let tokenPrice = (await m1.calculateTokenPrice("0x455448")).toNumber();
		let tka = (tokenAmount/tokenPrice + initialTokens/1e18);
		let tokensAvailable = tka.toFixed(3);
		let presentPoolBalance = (await P1.getEtherPoolBalance()).toNumber();
		var newPoolBalance = ((initialPoolBalance/1e18) + (tokenAmount/1e18))*1e18;
		presentPoolBalance.should.equal(newPoolBalance);
		tokens3d.should.equal(tokensAvailable);
	});

	it('should able to buy more tokens', async function () {	
		let initialTokens = await nxmtk1.totalBalanceOf(member);
		let initialPoolBalance = await P1.getEtherPoolBalance();
		await P1.buyTokenBegin({from:member,value:tokenAmount});
		let tokenPrice = await m1.calculateTokenPrice("0x455448");
		let tokens = await nxmtk1.totalBalanceOf(member);
		let tokens3d = (tokens/1e18).toFixed(3);
		let tka = (tokenAmount/tokenPrice + initialTokens/1e18);
		let tokensAvailable = tka.toFixed(3);
		let presentPoolBalance = (await P1.getEtherPoolBalance()).toNumber();
		var newPoolBalance = ((initialPoolBalance/1e18) + (tokenAmount/1e18))*1e18;
		presentPoolBalance.should.equal(newPoolBalance);
		tokens3d.should.equal(tokensAvailable);
	});

	// it('should able to sell tokens', async function () {
	// 	let initialTokens = await nxmtk1.totalBalanceOf(member);
	// 	let tokenPrice = await m1.calculateTokenPrice("0x455448");
	// 	let sellPrice = tokenPrice * 97.5 / 100;
	// 	let initialPoolBalance = await P1.getEtherPoolBalance();
	// 	await P1.sellNXMTokens(sellTokens, {from:member});
	// 	let worthTokens = sellPrice * sellTokens;
	// 	let tokens = await nxmtk1.totalBalanceOf(member);
	// 	let tokensAvailable = initialTokens - sellTokens;
	// 	tokensAvailable.should.be.bignumber.equal(tokens);
	// 	let presentPoolBalance = await P1.getEtherPoolBalance();
	// 	presentPoolBalance.should.be.bignumber.equal(initialPoolBalance - worthTokens);
	// });
});
