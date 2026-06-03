// Bundle the .tflite model as an asset so require('...model.tflite') works.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflite');

module.exports = config;
