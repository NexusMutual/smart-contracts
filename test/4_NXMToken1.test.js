const NXMToken1 = artifacts.require("NXMToken1");
const NXMTokenData = artifacts.require("NXMTokenData");
const member = web3.eth.accounts[4];
const receiver = web3.eth.accounts[5];
const amount = web3.toWei(1);
const Tokens = web3.toWei(200);
const LockDays = 30;
const ExtendLockDays = 10*24*3600;
const ExtendLockAmount = web3.toWei(300);
const tokensToTransfer = web3.toWei(20);
let nxmtk1;
let P1;
let nxmData;

require('chai')
   .should();

contract('NXMToken1', function () {
	it('should able to lock tokens under Claim Assesment', async function () {
		
		nxmtk1 = await NXMToken1.deployed();		
		let NOW = Math.floor(Date.now()/1000);
		let initialLocked = await nxmtk1.tokensLocked(member, "0x434c41", NOW);
		let initialAvailableTokens = await nxmtk1.balanceOf(member);
		initialLocked.should.equal(0);
		let validity = NOW+(LockDays*24*3600);
		await nxmtk1.lock("0x434c41", Tokens, validity);
		let tokenLocked = await nxmtk1.tokensLocked(member, "0x434c41", NOW);
		let availableTokens = await nxmtk1.balanceOf(member);
		availableTokens.should.equal(initialAvailableTokens-Tokens);
		tokenLocked.should.equal(Tokens);
	});

	it('should able to extend validity of tokens for Claim Assesment', async function () {
	
		nxmData = await NXMTokenData.deployed();
		initialLocked.should.not.equal(0);
		let lockedTokens = await nxmData.locked(member, "0x434c41");
		let initialValidity = lockedTokens[0];
		await nxmtk1.extendLock("0x434c41", ExtendLockDays);	
		let lockedTokensAfter = await nxmData.locked(member, "0x434c41");
		let newValidity = lockedTokensAfter[0];
		newValidity.should.equal(initialValidity+ExtendLockDays);	
		
	});

	it('should able to extend amount of tokens for Claim Assesment', async function () {
	
		
		initialLocked.should.not.equal(0);
		let initialTokenAvailable = await nxmtk1.balanceOf(member);
		let lockedTokens = await nxmData.locked(member, "0x434c41");
		let initialAmount = lockedTokens[1];
		await nxmtk1.increaseLockAmount("0x434c41", ExtendLockAmount);	
		let newTokenAvailable = await nxmtk1.balanceOf(member);
		let lockedTokensAfter = await nxmData.locked(member, "0x434c41");
		let newAmount = lockedTokensAfter[1];
		newAmount.should.equal(initialAmount+ExtendLockAmount);	
		newTokenAvailable.should.equal(initialTokenAvailable - ExtendLockAmount);
		
	});

	it('should able to transfer tokens to any other member', async function () {
	
		let initialTokenMember = await nxmtk1.balanceOf(member);
		let initialTokenReceiver = await nxmtk1.balanceOf(receiver);
		await nxmtk1.transfer(receiver, tokensToTransfer);
		let presentTokenMember = await nxmtk1.balanceOf(member);
		let presentTokenReceiver = await nxmtk1.balanceOf(receiver);
		presentTokenMember.should.equal(initialTokenMember - tokensToTransfer);
		presentTokenReceiver.should.equal(initialTokenReceiver + tokensToTransfer);
	
	});

});
