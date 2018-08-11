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
        return gbm.addGovBlocksUser("0x41", GBTStandardToken.address, "descHash");
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
        return ms.initMaster(own,"0x41");
    })
    .then(function(){
        return ms.changeGBMAddress(GovBlocksMaster.address);
    })
    .then(function(){
        var addr = [gd.address, mr.address, pc.address, sv.address, gv.address, pl.address];
        return ms.addNewVersion(addr);
    })
    .then(function(){
        return gbm.changeDappMasterAddress("0x41", Master.address);
    })
    .then(function(){
        console.log("Initialization completed!");
    });
};