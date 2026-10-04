module.exports = function (api) {
  const isTest = api.env('test');
  api.cache.using(() => isTest);
  // babel-preset-expo already wires up expo-router and the worklets/reanimated plugin.
  // NativeWind's JSX transform is skipped under Jest, which only tests plain TypeScript.
  return {
    presets: isTest
      ? ['babel-preset-expo']
      : [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
