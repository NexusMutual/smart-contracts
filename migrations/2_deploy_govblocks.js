var NXMToken1 = artifacts.require('NXMToken1');
var MemberRoles = artifacts.require('MemberRoles');
const owner = web3.eth.accounts[0];

module.exports = deployer => {
  deployer
    .deploy(NXMToken1)
    .then(function() {
      return NXMToken1.deployed();
    })
    .then(function(instance) {
      let addr = instance.address;
      console.log(addr);
      return deployer.deploy(
        MemberRoles,
        '0x4e455855532d4d555455414c',
        addr,
        owner
      );
    });
};
