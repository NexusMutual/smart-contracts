
interface IPooledStaking {
    function pushReward(address contractAddress, uint amount) external;
    function pushBurn(address contractAddress, uint amount) external;

    function contractStakedAmount(address contractAddress) external view returns (uint);
    function stakerReward(address staker) external view returns (uint);
    function stakerStaked(address staker) external view returns (uint);

    function unstake(uint amount) external;
    function getMaxUnstakable(address stakerAddress) external view returns (uint);

    function withdrawReward(uint amount) external;
}

