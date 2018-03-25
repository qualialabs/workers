Package.describe({
  name: 'qualia:workers',
  version: '0.0.1',
  summary: 'Simple parallelization across processes and fibers.',
  git: 'http://github.com/qualialabs/workers',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('METEOR@1.4');

  api.use([
    'ecmascript',
    'underscore',
    'mongo',
    'random',
    'ejson',
    'promise',
  ], ['server']);

  api.mainModule('workers.js', 'server');
});

Package.onTest(function(api) {
  api.use([
    'ecmascript',
    'underscore',
    'ejson',
    'random',
    'tinytest',
    'qualia:workers',
  ], ['server']);

  api.mainModule('tests.js', 'server');
});
