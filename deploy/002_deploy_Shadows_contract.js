module.exports = async ({ getNamedAccounts, deployments, getChainId }) => {
  const { deploy, get } = deployments;
  const { deployer, loftOwner } = await getNamedAccounts();

  await deploy("LOFT", {
    from: deployer,
    proxy: {
      methodName: "initialize",
      proxyContract: "OptimizedTransparentProxy",
    },
    log: true,
  });
};
module.exports.tags = ["LOFT", "Token", "deploy"];
