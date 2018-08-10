var MemberRoles = artifacts.require("MemberRoles");
var GovBlocksMaster = artifacts.require("GovBlocksMaster");
var Master = artifacts.require("Master");
var GBTStandardToken = artifacts.require("GBTStandardToken");
var Governance = artifacts.require("Governance");
var GovernanceData = artifacts.require("GovernanceData");
var Pool = artifacts.require("Pool");
var ProposalCategory = artifacts.require("ProposalCategory");
var SimpleVoting = artifacts.require("SimpleVoting");
var EventCaller = artifacts.require("EventCaller");
var claims = artifacts.require("claims");
var claimsData = artifacts.require("claimsData");
var claimsReward = artifacts.require("claimsReward");
var master = artifacts.require("master");
var master2 = artifacts.require("masters2");
var mcr = artifacts.require("mcr");
var mcrData = artifacts.require("mcrData");
var nxmToken = artifacts.require("nxmToken");
var nxmToken2 = artifacts.require("nxmToken2");
var nxmTokenData = artifacts.require("nxmTokenData");
var pool = artifacts.require("pool");
var pool2 = artifacts.require("pool2");
var pool3 = artifacts.require("pool3");
var poolData = artifacts.require("poolData");
var quotation2 = artifacts.require("quotation2");
var quotationData = artifacts.require("quotationData");
const json = require('./../build/contracts/Master.json');
var bytecode = json['bytecode'];

module.exports = deployer => {
    let gbt;
    let ec;
    let gbm;
    let gd;
    let mr;
    let sv;
    let pc;
    let gv;
    let pl;
    let ms;
    let nms;
    let nms2;
    let nxm;
    let nxm2;
    let td;
    let pl1;
    let pl2;
    let pl3;
    let pd;
    let q2;
    let qd;
    let cl;
    let cr;
    let cd;
    let mc;
    let mcd;
    let nown;

    deployer
    .then(() => GBTStandardToken.deployed())
    .then(function(instance){ 
        gbt = instance;
        return EventCaller.deployed();
    })
    .then(function(instance){
        ec = instance;
        return GovBlocksMaster.deployed();
    })
    .then(function(instance){
        gbm = instance;
        return gbm.govBlocksMasterInit(gbt.address, ec.address);
    })
    .then(function() {
        return gbm.setMasterByteCode(bytecode.substring(10000));
    })
    .then(function() {
        return gbm.setMasterByteCode(bytecode);
    })
    .then(function() {
        return nxmToken.deployed();
    })
    .then(function(instance) {
        nxm = instance;
        return gbm.addGovBlocksUser("0x4e455855532d4d555455414c", nxm.address, "descHash");
    })
    .then(function(){
        return GovernanceData.deployed();
    })
    .then(function(instance){ 
        gd = instance;
        return MemberRoles.deployed();
    })
    .then(function(instance){
        mr = instance;
        return ProposalCategory.deployed();
    })
    .then(function(instance){
        pc = instance;
        return pc.proposalCategoryInitiate();
    })
    .then(function(){ 
        return SimpleVoting.deployed();
    })
    .then(function(instance){ 
        sv = instance;
        return Governance.deployed();
    })
    .then(function(instance){ 
        gv = instance;
        return Pool.deployed();
    })
    .then(function(instance){
        pl = instance;
        return Master.deployed();
    })
    .then(function(instance){
        ms = instance;
        return gbm.owner();
    })
    .then(function(own){
        return ms.initMaster(own,"0x4e455855532d4d555455414c");
    })
    .then(function(){
        return ms.changeGBMAddress(GovBlocksMaster.address);
    })
    .then(function(){
        var addr = [gd.address, mr.address, pc.address, sv.address, gv.address, pl.address];
        return ms.addNewVersion(addr);
    })
    .then(function(){
        return gbm.changeDappMasterAddress("0x4e455855532d4d555455414c", Master.address);
    })
    .then(function(){
        console.log("Nexus-Mutual Dapp added!");
        return master.deployed();
    })
    .then(function(instance){
        nms = instance;  
        return master2.deployed();
    })
    .then(function(instance){
        nms2 = instance;
        return nxmToken2.deployed();
    })
    .then(function(instance){
        nxm2 = instance;
        return nxmTokenData.deployed();
    })
    .then(function(instance){
        td = instance;
        return mcr.deployed();
    })
    .then(function(instance){
        mc = instance;
        return mcrData.deployed();
    })
    .then(function(instance){
        mcd = instance;
        return pool.deployed();
    })
    .then(function(instance){
        pl1 = instance;
        return pool2.deployed();
    })
    .then(function(instance){
        pl2 = instance;
        return pool3.deployed();
    })
    .then(function(instance){
        pl3 = instance;
        return poolData.deployed();
    })
    .then(function(instance){
        pd = instance;
        return claims.deployed();
    })
    .then(function(instance){
        cl = instance;
        return claimsReward.deployed();
    })
    .then(function(instance){
        cr = instance;
        return claimsData.deployed();
    })
    .then(function(instance){
        cd = instance;
	return quotation2.deployed();
    })
    .then(function(instance){
        q2 = instance;
        return quotationData.deployed();
    })
    .then(function(instance){
	qd = instance;
	var addr = [qd.address, td.address, cd.address, pd.address, mcd.address, q2.address, nxm.address, nxm2.address, cl.address, cr.address, pl1.address, pl2.address, nms2.address, mc.address, pl3.address];
	console.log("address initialized");
	return nms.addNewVersion(addr);
    })
    .then(function(){
	console.log("Add new version");
        return nms.switchToRecentVersion();
    })
    .then(function(){
        return nms.owner();
    })
    .then(function(owner){
	nown = owner;
	return pl1.takeEthersOnly( {from: nown, value: 9000000000000000000});
    })
    .then(function(){
        return td.setWalletAddress(nown); //"0x7266c50f1f461d2748e675b907ef22987f6b5358");
    })
    .then(function(){
        return qd.changeAuthQuoteEngine("0xb24919181daead6635e613576ca11c5aa5a4e133");
    })
    .then(function(){
        return nms2.addCoverStatus();
    })
    .then(function(){
        return nms2.callPoolDataMethods();
    })
    .then(function(){
        return nms2.addStatusInClaims();
    })
    .then(function(){
        return nms2.addMCRCurr();
    })
    .then(function(){
        return nms2.addStatusInClaims();
    })
    .then(function(){
        return pd.changeWETHAddress("0xd0a1e359811322d97991e03f863a0c30c2cf029c");
    })
    .then(function(){
        return pd.change0xMakerAddress(nown); //"0x7266C50F1f461d2748e675B907eF22987F6B5358");
    })
    .then(function(){
        return pl2.changeExchangeContractAddress("0x90fe2af704b34e0224bf2299c838e04d4dcf1364");
    })
    .then(function(){
        return pl3.changeExchangeContractAddress("0x90fe2af704b34e0224bf2299c838e04d4dcf1364");
    })
    .then(function(){
        return mc.changeNotariseAddress(nown); //"0x7266c50f1f461d2748e675b907ef22987f6b5358");
    })
    .then(function(){
	    var arg1 = 18000;
        var arg2 = 10000;
        var arg3 = 2;
		var arg4 = ["0x455448","0x444149"];
        var arg5 = [100,65407];
        var arg6 = 20180807;
	    return mc.addMCRData(arg1,arg2,arg3,arg4,arg5,arg6);
    })
    .then(function(){ 
		console.log("NXM initialized");
    });
};


