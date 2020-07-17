pragma solidity ^0.5.7;

interface IPooledStaking {

    function pushReward(address contractAddress, uint amount) external;
    function pushBurn(address contractAddress, uint amount) external;
    function hasPendingActions() external view returns (bool);

    function contractStake(address contractAddress) external view returns (uint);
    function stakerReward(address staker) external view returns (uint);
    function stakerDeposit(address staker) external view returns (uint);
    function stakerContractStake(address staker, address contractAddress) external view returns (uint);

    function withdraw(uint amount) external;
    function stakerMaxWithdrawable(address stakerAddress) external view returns (uint);
    function withdrawReward(address stakerAddress) external;
}
