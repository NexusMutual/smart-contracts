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

module.exports = function(deployer) {
    deployer.deploy(GBTStandardToken);
    deployer.deploy(EventCaller);
    deployer.deploy(GovBlocksMaster);
    deployer.deploy(GovernanceData);
    deployer.deploy(Governance);
    deployer.deploy(Pool);
    deployer.deploy(ProposalCategory);
    deployer.deploy(SimpleVoting);
    deployer.deploy(MemberRoles);
    deployer.deploy(Master);
};