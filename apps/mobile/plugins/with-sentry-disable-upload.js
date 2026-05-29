const { withXcodeProject, withAppBuildGradle } = require('expo/config-plugins');

function withIos(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const configurations = project.pbxXCBuildConfigurationSection();
    for (const ref in configurations) {
      const entry = configurations[ref];
      if (typeof entry !== 'object' || !entry.buildSettings) continue;
      if (entry.name === 'Debug') {
        entry.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD = '"true"';
      } else {
        delete entry.buildSettings.SENTRY_DISABLE_AUTO_UPLOAD;
      }
    }
    return cfg;
  });
}

const ANDROID_BEGIN = '// >>> with-sentry-disable-upload BEGIN';
const ANDROID_END = '// <<< with-sentry-disable-upload END';

function withAndroid(config) {
  return withAppBuildGradle(config, (cfg) => {
    const stripped = cfg.modResults.contents.replace(
      new RegExp(`${ANDROID_BEGIN}[\\s\\S]*?${ANDROID_END}\\n?`, 'g'),
      ''
    );
    const snippet = [
      ANDROID_BEGIN,
      'def __sentryIsReleaseBuild = gradle.startParameter.taskNames.any { it.toLowerCase().contains("release") }',
      'project.ext.set("sentryEnableSourcemaps", __sentryIsReleaseBuild)',
      ANDROID_END,
      '',
    ].join('\n');
    cfg.modResults.contents = `${snippet}\n${stripped}`;
    return cfg;
  });
}

module.exports = (config) => withAndroid(withIos(config));
