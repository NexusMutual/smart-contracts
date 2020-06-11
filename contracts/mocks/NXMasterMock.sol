pragma solidity ^0.5.7;


import "../NXMaster.sol";


contract NXMasterMock is NXMaster {

    /// @dev Creates a new version of contract addresses
    /// @param _contractAddresses Array of contract addresses which will be generated
    function addNewVersion(address payable[] memory _contractAddresses) public {

        require(msg.sender == owner && !masterInitialized,"Caller should be owner and should only be called once.");
        require(_contractAddresses.length == allContractNames.length, "array length not same");
        masterInitialized = true;

        MemberRoles mr = MemberRoles(_contractAddresses[14]);   
        // shoud send proxy address for proxy contracts (if not 1st time deploying) 
        bool isMasterUpgrade = mr.nxMasterAddress() != address(0);

        for (uint i = 0; i < allContractNames.length; i++) {
            require(_contractAddresses[i] != address(0),"NULL address is not allowed.");
            if (isProxy[allContractNames[i]]) {
                if (isMasterUpgrade) {
                    allContractVersions[allContractNames[i]] = _contractAddresses[i];
                } else {
                    address proxyAddress = _generateProxy(_contractAddresses[i]);
                    allContractVersions[allContractNames[i]] = address(uint160(proxyAddress));
                    contractsActive[proxyAddress] = true;
                    if (allContractNames[i] == "MR") {
                        mr = MemberRoles(proxyAddress);
                        mr.memberRolesInitiate(owner, allContractVersions["TF"]);
                    }
                }
            } else {
                allContractVersions[allContractNames[i]] = _contractAddresses[i];
            }
            Iupgradable up = Iupgradable(allContractVersions[allContractNames[i]]);
            up.changeMasterAddress(address(this));

        }
        if (!isMasterUpgrade) {
            _changeAllAddress();
            TokenController tc = TokenController(getLatestAddress("TC"));
            tc.changeOperator(getLatestAddress("TC"));
        }  

        // Need to override owner as owner in MR to avoid inconsistency as owner in MR is some other address. 
        (, address[] memory mrOwner) = mr.members(uint(MemberRoles.Role.Owner));
        owner = mrOwner[0];
    }

    function setContractAddress(bytes2 contractName, address payable contractAddress) external {
        contractsActive[contractAddress] = true;
        allContractVersions[contractName] = contractAddress;
    }
}
