module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Required by VisionCamera frame processors (worklets) used in src/camera.
    plugins: ['react-native-worklets-core/plugin'],
  };
};
