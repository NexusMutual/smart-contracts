
interface IPooledStaking {
    function pushReward(address contractAddress, uint amount) external;
    function pushBurn(address contractAddress, uint amount) external;

    function contractStakedAmount(address contractAddress) external view returns (uint);
    function stakerReward(address staker) external view returns (uint);
}

